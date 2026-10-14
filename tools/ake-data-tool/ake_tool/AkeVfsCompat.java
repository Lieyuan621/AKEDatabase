import java.lang.reflect.InvocationTargetException;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.zip.CRC32;
import tech.perlica.ci.models.vfs.*;

/** BLC v5 layout adapter shared by SDK image and Json consumers.
 * Input is already decrypted by the original SDK. No input file is rewritten. */
public final class AkeVfsCompat {
    private record Seen(String content, String tag, boolean v5) {}
    private static final Map<String, Seen> seen = new HashMap<>();

    public static synchronized VfsBlockInfo parse(byte[] bytes) throws Exception {
        require(bytes.length >= 24, "Truncated BLC header");
        ByteBuffer b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        int codeVersion = b.getInt(12);
        if (codeVersion != 5) {
            require(codeVersion == 3 || codeVersion == 4,
                "Unsupported BLC code version (not skipped): " + codeVersion);
            // Do not reinterpret older layouts; preserve SDK behavior exactly.
            VfsBlockInfo legacy;
            try {
                legacy = (VfsBlockInfo) VfsReader.class.getMethod("akeLegacyParse", byte[].class)
                    .invoke(VfsReader.INSTANCE, (Object) bytes);
            } catch (InvocationTargetException e) {
                throw new IllegalStateException("SDK legacy BLC parser failed (code version "
                    + codeVersion + ")", e.getCause());
            }
            for (VfsChunkInfo chunk : legacy.getChunks()) for (VfsFileInfo file : chunk.getFiles())
                remember(legacy.getBlockType(), file.getFileName(), file.getFileDataMd5(),
                    file.getFileTag().name(), false);
            return legacy;
        }
        CRC32 crc = new CRC32();
        crc.update(bytes, 12, bytes.length - 16);
        require(crc.getValue() == Integer.toUnsignedLong(b.getInt(bytes.length - 4)), "BLC v5 CRC mismatch");
        b.limit(bytes.length - 4);
        int protocol = b.getInt();
        if (protocol > 10) protocol = 3;
        b.position(16);
        int groupVersion = b.getInt();
        String group = text(b);
        byte[] groupHash = take(b, 8);
        String hash = HexFormat.of().withUpperCase().formatHex(groupHash, 0, 4);
        int expectedFiles = b.getInt();
        long expectedLength = b.getLong();
        VfsBlockType type = type(b);
        require(hash.equalsIgnoreCase(type.getHashName()), "BLC v5 group hash/type mismatch: " + hash);
        int chunkCount = count(b, 53);
        List<VfsChunkInfo> chunks = new ArrayList<>();
        Map<String, Seen> local = new HashMap<>();
        StringBuilder report = new StringBuilder("codeVersion=5\ngroup=" + group
            + "\ngroupVersion=" + groupVersion + "\ngroupHash=" + hash + "\n");
        long totalLength = 0;
        int totalFiles = 0;
        Set<String> distinctTags = new LinkedHashSet<>();
        for (int c = 0; c < chunkCount; c++) {
            byte[] chunkHash = take(b, 16), contentHash = take(b, 16);
            long length = b.getLong();
            require(length >= 0, "Negative chunk size");
            VfsBlockType chunkType = type(b);
            long chunkTag = b.getLong();
            int fileCount = count(b, 68);
            totalLength = Math.addExact(totalLength, length);
            String chunkName = HexFormat.of().withUpperCase().formatHex(chunkHash);
            report.append("chunk ").append(chunkName).append(" tag64=")
                .append(Long.toUnsignedString(chunkTag)).append('\n');
            distinctTags.add(Long.toUnsignedString(chunkTag));
            List<VfsFileInfo> files = new ArrayList<>();
            for (int f = 0; f < fileCount; f++) {
                String name = text(b);
                long nameHash = b.getLong();
                byte[] owner = take(b, 16), md5 = take(b, 16);
                long offset = b.getLong(), size = b.getLong();
                VfsBlockType fileType = type(b);
                int encrypted = Byte.toUnsignedInt(b.get());
                require(encrypted <= 1, "Invalid encryption flag: " + name);
                long iv = encrypted == 1 ? b.getLong() : 0;
                long tag = b.getLong();
                require(Arrays.equals(owner, chunkHash), "BLC chunk reference mismatch: " + name);
                require(offset >= 0 && size >= 0 && offset <= length && size <= length - offset,
                    "BLC file range mismatch: " + name);
                String rawTag = Long.toUnsignedString(tag);
                Seen entry = new Seen(HexFormat.of().formatHex(md5), rawTag, true);
                Seen previous = local.putIfAbsent(name, entry);
                require(previous == null || previous.equals(entry),
                    "Ambiguous v5 resource versions; cannot infer tag priority: " + name);
                report.append("file ").append(name).append(" tag64=").append(rawTag).append('\n');
                distinctTags.add(rawTag);
                // The old SDK exposes only Base/Patch. Base is a transport placeholder,
                // not an interpretation of tag64. Conflicting resources fail above and
                // across block types below, so this cannot silently choose an old asset.
                files.add(new VfsFileInfo(name, nameHash, owner, md5, offset, size, fileType,
                    encrypted == 1, iv, VfsFileTag.Base, false, VfsLoaderPosType.None));
            }
            totalFiles = Math.addExact(totalFiles, files.size());
            chunks.add(new VfsChunkInfo(chunkHash, contentHash, length, chunkType, VfsFileTag.Base, files));
        }
        require(totalFiles == expectedFiles && totalLength == expectedLength, "BLC v5 totals mismatch");
        report.append("trailingExtension=")
            .append(HexFormat.of().formatHex(take(b, b.remaining()))).append('\n');
        String configuredDiagnostics = System.getProperty("ake.vfs.diagnostics");
        // SDK worker JVMs inherit the classpath, not arbitrary system properties.
        Path diagnostics = configuredDiagnostics != null ? Path.of(configuredDiagnostics)
            : Path.of(AkeVfsCompat.class.getProtectionDomain().getCodeSource()
                .getLocation().toURI()).getParent();
        Files.createDirectories(diagnostics);
        Files.writeString(diagnostics.resolve("blc-v5-" + hash + ".txt"), report, StandardCharsets.UTF_8);
        for (VfsChunkInfo chunk : chunks) for (VfsFileInfo file : chunk.getFiles())
            remember(type, file.getFileName(), file.getFileDataMd5(), local.get(file.getFileName()).tag(), true);
        System.out.println("[vfs-compat] " + group + " BLC v5: " + chunkCount + " chunks, "
            + totalFiles + " files; CRC/ranges checked; raw tag64 values=" + distinctTags
            + "; SDK tag placeholder=Base (ambiguous overrides rejected)");
        return new VfsBlockInfo(protocol, group, hash, expectedFiles, expectedLength, type, chunks);
    }

    private static void remember(VfsBlockType type, String name, byte[] md5, String tag, boolean v5) {
        // Bundle and InitBundle can overlap: do not allow the old tag enum to
        // choose between different v5 contents, including mixed v4/v5 inputs.
        String key = name.toLowerCase(Locale.ROOT);
        Seen value = new Seen(HexFormat.of().formatHex(md5), tag, v5);
        Seen old = seen.putIfAbsent(key, value);
        require(old == null || (!old.v5() && !v5) || old.content().equals(value.content()),
            "Ambiguous cross-block v5 resource: " + type + " " + name
                + "; raw tags " + (old == null ? "" : old.tag()) + " / " + tag);
    }
    private static VfsBlockType type(ByteBuffer b) {
        int id = Byte.toUnsignedInt(b.get());
        for (VfsBlockType type : VfsBlockType.values()) if (type.getId() == id) return type;
        throw new IllegalArgumentException("Unknown BLC block type (not skipped): " + id);
    }
    private static int count(ByteBuffer b, int minimum) {
        int n = b.getInt();
        require(n >= 0 && n <= b.remaining() / minimum, "Invalid BLC record count: " + n);
        return n;
    }
    private static String text(ByteBuffer b) throws Exception {
        return StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(take(b,
            Short.toUnsignedInt(b.getShort())))).toString();
    }
    private static byte[] take(ByteBuffer b, int n) {
        require(n >= 0 && n <= b.remaining(), "Truncated BLC at " + b.position());
        byte[] value = new byte[n]; b.get(value); return value;
    }
    private static void require(boolean ok, String message) {
        if (!ok) throw new IllegalArgumentException(message);
    }
}
