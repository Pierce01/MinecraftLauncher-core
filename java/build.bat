@ECHO OFF
SET JDK=C:\Program Files\Java\jdk1.8.0_202
SET EXTRACT=C:\Program Files\7-Zip\7z.exe

ECHO # JDK location: "%JDK%".

ECHO # Building LibraryUnpacker...

RD /Q /S build
MD build

"%JDK%\bin\javac.exe" -d "./build" -classpath "./classpath/xz-1.8.jar" ./src/LibraryUnpacker.java
CD build
"%EXTRACT%" x ..\classpath\*.jar
COPY ..\src\MANIFEST.MF META-INF\MANIFEST.MF
"%JDK%\bin\jar.exe" cvf Pack200.jar *
"%EXTRACT%" a Pack200.jar META-INF\MANIFEST.MF

MOVE /Y Pack200.jar ..
CD ..

ECHO # Finished executing "build.bat".

GOTO :EOF