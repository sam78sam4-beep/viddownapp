@echo off
echo ====================================
echo VidDown Build Script - JDK 11.0.6
echo ====================================

cd /d c:\Users\DZ\Desktop\viddown\android

echo.
echo 1. Cleaning old Gradle files...
if exist .gradle rmdir /s /q .gradle
if exist build rmdir /s /q build
if exist app\build rmdir /s /q app\build

echo.
echo 2. Setting environment variables...
set GRADLE_USER_HOME=%USERPROFILE%\.gradle
set JAVA_HOME=C:\Program Files\Java\jdk-17

echo.
echo Verifying JDK...
echo JAVA_HOME = "%JAVA_HOME%"
"%JAVA_HOME%\bin\java" -version

echo.
echo 3. Starting build (this may take 5-10 minutes)...
echo.

gradlew.bat clean build --stacktrace

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ====================================
    echo SUCCESS! Build completed.
    echo ====================================
    echo.
    echo APK Location:
    echo app\build\outputs\apk\debug\app-debug.apk
) else (
    echo.
    echo ====================================
    echo ERROR! Build failed.
    echo ====================================
)

pause