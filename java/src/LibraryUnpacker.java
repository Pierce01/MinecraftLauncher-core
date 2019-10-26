/**
 * This code is from: https://github.com/dedepete/Forgefier/tree/6340909734953debe6961100149d7907e16d047c/src/LibraryUnpacker used
 * with permission under MIT
 * 
 * ORIGINAL:
 * :: .pack.xz unpacker: dolboeb edition. Unpacks and decompresses .jar.pack.xz into normal JAR.
 * C# does not have any good unpack200 implementation. C# sucks.
 * Original code can be found here:
 * https://github.com/MinecraftForge/Installer/blob/2228c90908ea51c417dea631b9807618c6746f89/src/main/java/net/minecraftforge/installer/DownloadUtils.java
 * 
 */

package ru.dedepete.forgefier;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import java.util.jar.Pack200;

import org.tukaani.xz.XZInputStream;

public class LibraryUnpacker {
    public static void main(String[] args) {
        if (args.length != 2) {
            System.out.println("Usage: Pack200.jar <input.jar.pack.xz> <output.jar>");
            System.exit(1);
        }

        try {
            LibraryUnpacker.unpackLibrary(new File(args[1]), Files.readAllBytes(Paths.get(args[0])));
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public static void unpackLibrary(File output, byte[] data) throws IOException
    {
        if (output.exists()) {
            output.delete();
        }

        byte[] decompressed = LibraryUnpacker.readFully(new XZInputStream(new ByteArrayInputStream(data)));

        String end = new String(decompressed, decompressed.length - 4, 4);
        if (!"SIGN".equals(end)) {
            System.out.println("Unpacking failed, signature missing " + end);
            return;
        }

        int x = decompressed.length;
        int len =
                ((decompressed[x - 8] & 0xFF)      ) |
                ((decompressed[x - 7] & 0xFF) << 8 ) |
                ((decompressed[x - 6] & 0xFF) << 16) |
                ((decompressed[x - 5] & 0xFF) << 24);

        File temp = File.createTempFile("art", ".pack");
        System.out.println("Temp File:       " + temp.getAbsolutePath());
        System.out.println("Total Length:    " + (decompressed.length - len - 8));

        byte[] checksums = Arrays.copyOfRange(decompressed, decompressed.length - len - 8, decompressed.length - 8);

        OutputStream out = new FileOutputStream(temp);
        out.write(decompressed, 0, decompressed.length - len - 8);
        out.close();
        System.gc();

        FileOutputStream jarBytes = new FileOutputStream(output);
        JarOutputStream jos = new JarOutputStream(jarBytes);

        Pack200.newUnpacker().unpack(temp, jos);

        JarEntry checksumsFile = new JarEntry("checksums.sha1");
        checksumsFile.setTime(0);
        jos.putNextEntry(checksumsFile);
        jos.write(checksums);
        jos.closeEntry();

        jos.close();
        jarBytes.close();
        temp.delete();
    }

    public static byte[] readFully(InputStream stream) throws IOException
    {
        byte[] data = new byte[4096];
        ByteArrayOutputStream entryBuffer = new ByteArrayOutputStream();
        int len;
        do {
            len = stream.read(data);
            if (len > 0) {
                entryBuffer.write(data, 0, len);
            }
        } while (len != -1);

        return entryBuffer.toByteArray();
    }
}