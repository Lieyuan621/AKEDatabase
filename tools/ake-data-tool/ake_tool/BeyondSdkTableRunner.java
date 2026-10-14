import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Locale;
import java.util.zip.CRC32;
import java.io.InputStream;

import tech.perlica.ci.TableCfgExtraction;
import tech.perlica.ci.TableCfgExtractionRequest;
import tech.perlica.ci.VFSTableCfgExtractor;
import tech.perlica.ci.models.vfs.SparkBufferDumper;
import tech.perlica.ci.models.vfs.VfsBlockType;
import tech.perlica.ci.models.vfs.VfsChaCha20;
import tech.perlica.ci.models.vfs.VfsKeys;

public final class BeyondSdkTableRunner {
    private BeyondSdkTableRunner() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            throw new IllegalArgumentException(
                "Usage: BeyondSdkTableRunner <vfs> <output>"
            );
        }

        Path vfsRoot = Path.of(args[0]).toAbsolutePath().normalize();
        Path outputRoot = Path.of(args[1]).toAbsolutePath().normalize();
        if (!Files.isDirectory(vfsRoot)) {
            throw new IllegalArgumentException(
                "TableCfg VFS input directory is missing: " + vfsRoot
            );
        }
        Files.createDirectories(outputRoot);

        Path rawRoot = outputRoot.resolve("raw");
        Path tableCfgRoot = outputRoot.resolve("data").resolve("TableCfg");
        if (extractVersion5(vfsRoot, outputRoot, tableCfgRoot)) {
            return;
        }
        TableCfgExtraction extraction = new VFSTableCfgExtractor().extract(
            new TableCfgExtractionRequest(vfsRoot, rawRoot, tableCfgRoot)
        );

        System.out.println(
            "TableCfg extracted: " + extraction.getFiles().size()
                + " JSON files from " + extraction.getRawExtractedFiles()
                + " VFS files"
        );
        System.out.println("TableCfg output: " + extraction.getOutputDirectory());
    }

    private record Entry(Path chunk, String name, long offset, int length,
                         boolean encrypted, long iv) {}

    // BLC code version (decrypted offset 12) is distinct from the outer
    // ChaCha protocol version. Version 5 stores an opaque 8-byte tag in both
    // chunk and file records; the bundled SDK consumes only 4 bytes.
    private static boolean extractVersion5(Path vfs, Path output, Path tables) throws Exception {
        String hash = VfsBlockType.Table.getHashName();
        Path block = vfs.resolve(hash);
        byte[] source = Files.readAllBytes(block.resolve(hash + ".blc"));
        require(source.length >= 24, "Truncated TableCfg BLC header");
        byte[] key = VfsKeys.INSTANCE.getPcKey();
        byte[] body = VfsChaCha20.INSTANCE.crypt(
            Arrays.copyOfRange(source, 12, source.length), key,
            Arrays.copyOf(source, 12), 1
        );
        ByteBuffer data = ByteBuffer.wrap(body).order(ByteOrder.LITTLE_ENDIAN);
        int codeVersion = data.getInt();
        if (codeVersion == 3 || codeVersion == 4) return false;
        require(codeVersion == 5, "Unsupported TableCfg BLC code version: " + codeVersion);
        CRC32 crc = new CRC32();
        crc.update(body, 0, body.length - 4);
        require(crc.getValue() == Integer.toUnsignedLong(data.getInt(body.length - 4)),
            "TableCfg BLC CRC mismatch");
        data.limit(body.length - 4);
        int groupVersion = data.getInt();
        String group = readText(data);
        byte[] groupHash = readBytes(data, 8);
        require(HexFormat.of().formatHex(groupHash, 0, 4).equalsIgnoreCase(hash),
            "TableCfg BLC group hash mismatch");
        int expectedFiles = data.getInt();
        long expectedBytes = data.getLong();
        require(Byte.toUnsignedInt(data.get()) == VfsBlockType.Table.getId(),
            "Unexpected TableCfg BLC block type");
        int chunks = count(data, 53, "chunk");
        ArrayList<Entry> entries = new ArrayList<>();
        HashSet<String> names = new HashSet<>();
        HashSet<String> chunkNames = new HashSet<>();
        StringBuilder metadata = new StringBuilder("codeVersion=5\ngroup=" + group
            + "\ngroupVersion=" + groupVersion + "\n");
        long chunkBytes = 0;
        for (int c = 0; c < chunks; c++) {
            byte[] chunkHash = readBytes(data, 16);
            byte[] contentHash = readBytes(data, 16);
            long size = data.getLong();
            int type = Byte.toUnsignedInt(data.get());
            long tag = data.getLong();
            int files = count(data, 68, "file");
            String chunkName = HexFormat.of().withUpperCase().formatHex(chunkHash) + ".chk";
            Path chunk = block.resolve(chunkName);
            require(chunkNames.add(chunkName), "Duplicate chunk: " + chunkName);
            require(size >= 0 && Files.isRegularFile(chunk) && !Files.isSymbolicLink(chunk)
                && Files.size(chunk) == size, "Missing or wrong-sized chunk: " + chunkName);
            require(type == VfsBlockType.Table.getId(), "Unexpected chunk type: " + type);
            chunkBytes = Math.addExact(chunkBytes, size);
            metadata.append("chunk ").append(chunkName).append(" tag64=")
                .append(Long.toUnsignedString(tag)).append(" contentMD5=")
                .append(HexFormat.of().formatHex(contentHash)).append('\n');
            for (int f = 0; f < files; f++) {
                String name = readText(data);
                long nameHash = data.getLong();
                byte[] owner = readBytes(data, 16);
                byte[] fileHash = readBytes(data, 16);
                long offset = data.getLong();
                long length = data.getLong();
                int fileType = Byte.toUnsignedInt(data.get());
                int encrypted = Byte.toUnsignedInt(data.get());
                require(encrypted <= 1, "Invalid encryption flag for " + name);
                long iv = encrypted == 1 ? data.getLong() : 0;
                long fileTag = data.getLong();
                require(Arrays.equals(owner, chunkHash), "Chunk reference mismatch: " + name);
                require(fileType == type, "Unexpected file block type: " + name);
                require(offset >= 0 && length >= 0 && length <= Integer.MAX_VALUE
                    && offset <= size && length <= size - offset, "Invalid file range: " + name);
                require(name.startsWith("Data/TableCfg/") && name.endsWith(".bytes"),
                    "Unsupported TableCfg entry (not skipped): " + name);
                Path target = tableTarget(tables, name);
                require(names.add(target.toString().toLowerCase(Locale.ROOT)),
                    "Duplicate TableCfg output: " + name);
                entries.add(new Entry(chunk, name, offset, (int) length, encrypted == 1, iv));
                // Preserve the full v5 fields; their meaning is not assumed and
                // they never determine whether a table is included.
                metadata.append("file ").append(name).append(" tag64=")
                    .append(Long.toUnsignedString(fileTag)).append(" nameHash=")
                    .append(Long.toUnsignedString(nameHash)).append(" dataMD5=")
                    .append(HexFormat.of().formatHex(fileHash)).append('\n');
            }
        }
        require(entries.size() == expectedFiles && chunkBytes == expectedBytes,
            "TableCfg BLC totals mismatch");
        // Preserve the CRC-covered extension instead of guessing its semantics.
        metadata.append("trailingExtension=")
            .append(HexFormat.of().formatHex(readBytes(data, data.remaining()))).append('\n');
        Files.writeString(output.resolve("tablecfg-blc-v5-metadata.txt"), metadata,
            StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
        int protocol = ByteBuffer.wrap(source).order(ByteOrder.LITTLE_ENDIAN).getInt();
        if (protocol > 10) protocol = 3; // Same outer protocol rule as VfsReader.
        System.out.println("TableCfg BLC v5: " + chunks + " chunks, " + entries.size()
            + " files; CRC and record ranges checked; using 64-bit tag fields");
        for (Entry entry : entries) {
            byte[] bytes;
            try (InputStream stream = Files.newInputStream(entry.chunk())) {
                stream.skipNBytes(entry.offset());
                bytes = stream.readNBytes(entry.length());
            }
            require(bytes.length == entry.length(), "Truncated table: " + entry.name());
            if (entry.encrypted()) {
                byte[] nonce = ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN)
                    .putInt(protocol).putLong(entry.iv()).array();
                bytes = VfsChaCha20.INSTANCE.crypt(bytes, key, nonce, 1);
            }
            Path target = tableTarget(tables, entry.name());
            Files.createDirectories(target.getParent());
            try {
                Files.writeString(target, SparkBufferDumper.INSTANCE.decrypt(bytes),
                    StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
            } catch (Exception failure) {
                throw new IllegalStateException("TableCfg decode failed: " + entry.name(), failure);
            }
        }
        System.out.println("TableCfg extracted: " + entries.size() + " JSON files");
        System.out.println("TableCfg output: " + tables);
        return true;
    }

    private static Path tableTarget(Path root, String name) {
        String relative = name.substring("Data/TableCfg/".length(), name.length() - 6) + ".json";
        require(!relative.contains("\\") && !relative.contains(":"), "Invalid table path: " + name);
        Path target = root.resolve(relative).normalize();
        require(target.startsWith(root) && !target.equals(root), "Table path escapes output: " + name);
        return target;
    }

    private static int count(ByteBuffer data, int minimum, String kind) {
        int count = data.getInt();
        require(count >= 0 && count <= data.remaining() / minimum, "Invalid " + kind + " count");
        return count;
    }

    private static byte[] readBytes(ByteBuffer data, int size) {
        require(size >= 0 && size <= data.remaining(), "Truncated BLC at " + data.position());
        byte[] value = new byte[size];
        data.get(value);
        return value;
    }

    private static String readText(ByteBuffer data) throws Exception {
        int size = Short.toUnsignedInt(data.getShort());
        return StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(readBytes(data, size))).toString();
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalArgumentException(message);
    }
}
