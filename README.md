# VidDown - Video Download App

A comprehensive video download application for Android with Node.js backend, supporting multiple platforms like YouTube, Instagram, Facebook, and TikTok.

## 📋 Features

- Multi-platform video downloading (YouTube, Instagram, Facebook, TikTok)
- Multiple quality options (480p, 720p, 1080p)
- Progress tracking and download management
- Background download support
- Auto MP3 conversion
- Modern Material Design UI
- Cross-platform compatibility

## 🏗️ Project Structure

```
viddown/
├── android/                 # Android application
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── java/com/example/viddown/
│   │   │   │   ├── MainActivity.java
│   │   │   │   ├── HomeFragment.java
│   │   │   │   ├── ExploreFragment.java
│   │   │   │   ├── DownloadsFragment.java
│   │   │   │   ├── SettingsFragment.java
│   │   │   │   ├── VideoItem.java
│   │   │   │   ├── DownloadItem.java
│   │   │   │   ├── VideoAdapter.java
│   │   │   │   └── DownloadAdapter.java
│   │   │   ├── res/
│   │   │   │   ├── layout/
│   │   │   │   ├── menu/
│   │   │   │   ├── navigation/
│   │   │   │   └── values/
│   │   │   └── AndroidManifest.xml
│   │   ├── build.gradle
│   │   └── proguard-rules.pro
│   ├── build.gradle
│   ├── settings.gradle
│   └── gradle.properties
├── server/                  # Node.js backend
│   ├── server.js
│   └── package.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Android Studio (latest version recommended)
- Android SDK API 33 installed
- Node.js (v14 or higher)
- Java JDK (Android Studio manages this automatically)
- Git
- At least 4GB free RAM for building

### 1. Clone and Setup Project

```bash
# Clone the repository
git clone <your-repo-url>
cd viddown
```

### 2. Setup Android Project

#### Open in Android Studio

1. **Launch Android Studio**
2. **Open Existing Project**:
   - Click `File` → `Open`
   - Navigate to `c:\Users\DZ\Desktop\viddown\android`
   - Select the `android` folder and click `OK`

3. **Configure Project**:
   - Android Studio will automatically sync the project
   - If prompted, install any missing SDK components
   - Ensure you have Android SDK API level 21+ installed

4. **Build the Project**:
   - Click `Build` → `Make Project` (Ctrl+F9)
   - Wait for Gradle sync to complete
   - Fix any build errors if they appear

#### Project Configuration

The Android project includes:
- **Minimum SDK**: API 21 (Android 5.0)
- **Target SDK**: API 30 (Android 11)
- **Dependencies**:
  - Navigation Component
  - RecyclerView
  - OkHttp for networking
  - WorkManager for background tasks

### 3. Setup Node.js Server

#### Install Dependencies

```bash
cd server
npm install
```

#### Local Development

```bash
# Start the server
npm start
```

The server will run on `http://localhost:3000`

#### Deploy to Render.com

1. **Create Render Account**:
   - Go to [render.com](https://render.com)
   - Sign up or login

2. **Deploy Web Service**:
   - Click `New` → `Web Service`
   - Connect your GitHub repository
   - Configure settings:
     - **Name**: `viddown-server`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
   - Click `Create Web Service`

3. **Get Deployment URL**:
   - After deployment, copy the service URL (e.g., `https://viddown-server.onrender.com`)

### 4. Connect App to Server

#### Update Server URL in Android App

1. Open `HomeFragment.java`
2. Find the line:
   ```java
   private static final String SERVER_URL = "https://your-render-app.onrender.com/download";
   ```
3. Replace with your deployed server URL:
   ```java
   private static final String SERVER_URL = "https://viddown-server.onrender.com/download";
   ```

### 5. Run the Application

#### Important: Use Android Studio IDE

**Do not run Gradle commands from command line** - use Android Studio's built-in tools to avoid permission and path issues.

#### Android Emulator/Device

1. **Create Virtual Device** (if using emulator):
   - Click `Tools` → `AVD Manager`
   - Create a new virtual device with API 21+

2. **Run App**:
   - Click `Run` → `Run 'app'` (Shift+F10)
   - Select your device/emulator
   - Wait for app to install and launch

3. **If Build Fails**:
   - Click `Build` → `Clean Project`
   - Click `File` → `Invalidate Caches / Restart`
   - Wait for Gradle sync to complete

#### Test Features

1. **Home Screen**:
   - Enter a YouTube video URL
   - Select quality from dropdown
   - Click Download

2. **Explore Screen**:
   - Browse different platforms
   - Search within platforms

3. **Downloads Screen**:
   - View ongoing downloads with progress
   - See completed downloads

4. **Settings Screen**:
   - Configure default quality
   - Set save location
   - Enable auto MP3 conversion

## 🔧 Configuration

### Android App Configuration

- **Minimum SDK**: API 21 (Android 5.0)
- **Target SDK**: API 33 (Android 13)
- **Build Tools**: 33.0.2
- **Gradle Version**: 7.4.2

### Android App Permissions

The app requires the following permissions (already configured in `AndroidManifest.xml`):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

### Server Configuration

The server uses the following dependencies (`package.json`):

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "ytdl-core": "^4.11.5",
    "cors": "^2.8.5"
  }
}
```

## 🐛 Troubleshooting

### Common Issues

1. **"Unable to find Gradle tasks to build" Error**:
   - This happens when Gradle wrapper files are missing
   - **Solution**: The project now includes all necessary Gradle wrapper files
   - If error persists: `File` → `Invalidate Caches / Restart` in Android Studio

2. **"Could not create parent directory for lock file" Error**:
   - This happens when Gradle tries to write to system directories (like Program Files)
   - **Solution**: The project is now configured to use `C:\Users\DZ\.gradle` as Gradle user home
   - If error persists: Delete the `.gradle` folder in your user directory and restart Android Studio

3. **JAVA_HOME Error**:
   - Android Studio manages Java automatically
   - If you see JAVA_HOME errors, ignore them - Android Studio will use its own JDK
   - The project is configured to work with Android Studio's built-in Java

3. **Gradle Sync Failed**:
   - Check internet connection
   - Ensure Android SDK is properly installed
   - Invalidate caches: `File` → `Invalidate Caches / Restart`

4. **Server Connection Failed**:
   - Verify server URL in `HomeFragment.java`
   - Check server logs on Render.com
   - Ensure server is running

5. **Download Failed**:
   - Check internet permissions
   - Verify storage permissions
   - Check server response

6. **Build Errors**:
   - Clean project: `Build` → `Clean Project`
   - Rebuild: `Build` → `Rebuild Project`
   - Check that all dependencies are downloaded

### Debug Mode

- Use Android Studio's Logcat to view app logs
- Server logs available in Render.com dashboard

## 📚 API Reference

### Server Endpoints

- `POST /download`: Download video
  - Body: `{"url": "video_url", "quality": "quality_option"}`
  - Returns: Video file stream

### Supported Platforms

- YouTube
- Instagram
- Facebook
- TikTok

### Quality Options

- High (1080p)
- Medium (720p)
- Low (480p)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit a pull request

## 📄 License

This project is for educational purposes only. Please respect copyright laws and platform terms of service.

## ⚠️ Disclaimer

This application is developed for educational purposes. Users are responsible for complying with copyright laws and platform terms of service when downloading content.