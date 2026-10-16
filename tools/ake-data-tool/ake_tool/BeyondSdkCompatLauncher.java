import java.io.*;
import java.lang.reflect.InvocationTargetException;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.jar.JarFile;
import javax.tools.ToolProvider;

/** Keeps the installed SDK untouched. Only its BLC parser entry point is wrapped;
 * all other SDK bytecode, including the legacy parser, is loaded unchanged. */
public final class BeyondSdkCompatLauncher {
    public static void main(String[] args) throws Throwable {
        if (args.length < 4) throw new IllegalArgumentException(
            "Usage: launcher <sdk> <work> <parser-source> <runner-source-or-dash> [args...]");
        Path sdk = Path.of(args[0]).toAbsolutePath();
        Path work = Path.of(args[1]).toAbsolutePath();
        // Unique per invocation: cancelled/concurrent runs cannot reuse partial classes.
        Files.createDirectories(work);
        Path classes = Files.createTempDirectory(work, "classes-");
        var compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("A full JDK is required for SDK compatibility");
        List<String> compile = new ArrayList<>(List.of(
            "-encoding", "UTF-8", "-proc:none", "-classpath", sdk.toString(),
            "-d", classes.toString(), args[2]));
        String main;
        if (!args[3].equals("-")) {
            compile.add(args[3]);
            main = Path.of(args[3]).getFileName().toString().replaceFirst("\\.java$", "");
        } else {
            try (JarFile jar = new JarFile(sdk.toFile())) {
                main = jar.getManifest().getMainAttributes().getValue("Main-Class");
            }
        }
        if (compiler.run(null, System.out, System.err, compile.toArray(String[]::new)) != 0)
            throw new IllegalStateException("SDK compatibility compilation failed; no extraction started");
        // JsonExporter starts a separate JVM from java.class.path. A custom
        // loader alone cannot propagate either the SDK or our parser to it.
        String readerResource = "tech/perlica/ci/models/vfs/VfsReader.class";
        try (JarFile jar = new JarFile(sdk.toFile())) {
            var entry = jar.getJarEntry(readerResource);
            if (entry == null) throw new IOException("SDK VfsReader class not found");
            try (InputStream input = jar.getInputStream(entry)) {
                Path patched = classes.resolve(readerResource);
                Files.createDirectories(patched.getParent());
                Files.write(patched, wrapParser(input.readAllBytes()), StandardOpenOption.CREATE_NEW);
            }
        }
        System.setProperty("java.class.path", classes + File.pathSeparator + sdk);
        System.setProperty("ake.vfs.diagnostics", work.toString());
        try (URLClassLoader loader = new URLClassLoader(
                new URL[]{classes.toUri().toURL(), sdk.toUri().toURL()},
                ClassLoader.getPlatformClassLoader())) {
            Thread.currentThread().setContextClassLoader(loader);
            // Resolve before the SDK starts any downloads or extraction.
            loader.loadClass("tech.perlica.ci.models.vfs.VfsReader")
                .getMethod("akeLegacyParse", byte[].class);
            System.out.println("AKE BLC compatibility: enabled for known SDK SHA256 a5705238a0ed48953b8a12d2146150316ad9b870c0ae42cf6f77fdd15620df68; other SDK behavior preserved");
            try {
                loader.loadClass(main).getMethod("main", String[].class)
                    .invoke(null, (Object) Arrays.copyOfRange(args, 4, args.length));
            } catch (InvocationTargetException e) { throw e.getCause(); }
        }
    }

    // A small class-file edit, not an SDK rebuild: rename the original method,
    // then append a five-byte forwarding body with its original signature.
    // Unknown class layouts/signatures fail closed rather than patching by offset.
    private static byte[] wrapParser(byte[] source) throws IOException {
        Cursor c = new Cursor(source);
        if (c.u4() != 0xCAFEBABE) throw new IOException("Invalid SDK class file");
        c.skip(4);
        int cpCount = c.u2();
        Map<Integer, String> strings = new HashMap<>();
        for (int i = 1; i < cpCount; i++) {
            int tag = c.u1();
            switch (tag) {
                case 1 -> { int n = c.u2(); strings.put(i, new String(source, c.pos, n,
                    java.nio.charset.StandardCharsets.UTF_8)); c.skip(n); }
                case 3, 4, 9, 10, 11, 12, 17, 18 -> c.skip(4);
                case 5, 6 -> { c.skip(8); i++; }
                case 7, 8, 16, 19, 20 -> c.skip(2);
                case 15 -> c.skip(3);
                default -> throw new IOException("Unsupported SDK constant-pool tag " + tag);
            }
        }
        int poolEnd = c.pos;
        c.skip(6); c.skip(2 * c.u2());
        int fields = c.u2();
        for (int i = 0; i < fields; i++) { c.skip(6); c.attributes(); }
        int methodCountPosition = c.pos;
        int methods = c.u2();
        int renamePosition = -1, nameIndex = -1, descriptorIndex = -1;
        String descriptor = "([B)Ltech/perlica/ci/models/vfs/VfsBlockInfo;";
        for (int i = 0; i < methods; i++) {
            int flags = c.u2(), namePos = c.pos, name = c.u2(), desc = c.u2();
            if ("akeLegacyParse".equals(strings.get(name))) throw new IOException("SDK already wrapped");
            if ("parseBlockInfo$beyond_sdk".equals(strings.get(name))) {
                if (renamePosition >= 0 || !descriptor.equals(strings.get(desc)) || (flags & 9) != 1)
                    throw new IOException("Unsupported SDK BLC parser signature");
                renamePosition = namePos; nameIndex = name; descriptorIndex = desc;
            }
            c.attributes();
        }
        if (renamePosition < 0) throw new IOException("SDK BLC parser method not found");
        int methodEnd = c.pos;
        if (cpCount > 65527 || methods == 65535) throw new IOException("SDK class is too large");
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(buffer);
        out.write(source, 0, 8); out.writeShort(cpCount + 8);
        out.write(source, 10, poolEnd - 10);
        utf(out, "AkeVfsCompat");                       // +0 UTF8 class
        out.writeByte(7); out.writeShort(cpCount);       // +1 Class
        utf(out, "parse");                              // +2 UTF8 method
        utf(out, descriptor);                           // +3 UTF8 descriptor
        out.writeByte(12); out.writeShort(cpCount + 2); out.writeShort(cpCount + 3); // +4 NameAndType
        out.writeByte(10); out.writeShort(cpCount + 1); out.writeShort(cpCount + 4); // +5 Methodref
        utf(out, "akeLegacyParse");                     // +6 original method's new name
        utf(out, "Code");                               // +7 attribute
        out.write(source, poolEnd, methodCountPosition - poolEnd);
        out.writeShort(methods + 1);
        out.write(source, methodCountPosition + 2, renamePosition - methodCountPosition - 2);
        out.writeShort(cpCount + 6);
        out.write(source, renamePosition + 2, methodEnd - renamePosition - 2);
        out.writeShort(0x11); out.writeShort(nameIndex); out.writeShort(descriptorIndex);
        out.writeShort(1); out.writeShort(cpCount + 7); out.writeInt(17);
        out.writeShort(1); out.writeShort(2); out.writeInt(5);
        out.writeByte(0x2b); out.writeByte(0xb8); out.writeShort(cpCount + 5); out.writeByte(0xb0);
        out.writeShort(0); out.writeShort(0);
        out.write(source, methodEnd, source.length - methodEnd);
        return buffer.toByteArray();
    }

    private static void utf(DataOutputStream out, String s) throws IOException {
        out.writeByte(1); out.writeUTF(s);
    }
    private static final class Cursor {
        final byte[] bytes; int pos;
        Cursor(byte[] bytes) { this.bytes = bytes; }
        int u1() throws IOException { need(1); return bytes[pos++] & 255; }
        int u2() throws IOException { return (u1() << 8) | u1(); }
        int u4() throws IOException { return (u2() << 16) | u2(); }
        void need(int n) throws IOException {
            if (n < 0 || n > bytes.length - pos) throw new IOException("Truncated SDK class file");
        }
        void skip(int n) throws IOException { need(n); pos += n; }
        void attributes() throws IOException {
            int count = u2();
            for (int i = 0; i < count; i++) { skip(2); skip(u4()); }
        }
    }
}
