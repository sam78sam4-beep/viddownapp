const express = require('express');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 10000;

// ✅ التحقق من تثبيت yt-dlp بطريقة محسنة
async function checkAndInstallYtDlp() {
    console.log('🔍 Checking yt-dlp installation...');
    
    try {
        // المحاولة الأولى: التحقق إذا كان yt-dlp مثبتاً
        execSync('yt-dlp --version', { stdio: 'pipe' });
        console.log('✅ yt-dlp is already installed');
        return true;
    } catch (error) {
        console.log('⚠️ yt-dlp not found, attempting installation...');
        
        try {
            // المحاولة الثانية: التثبيت باستخدام pip
            console.log('📦 Installing yt-dlp via pip...');
            execSync('pip install yt-dlp', { stdio: 'inherit' });
            console.log('✅ yt-dlp installed successfully via pip');
            return true;
        } catch (pipError) {
            console.log('❌ pip installation failed, trying alternative methods...');
            
            try {
                // المحاولة الثالثة: التثبيت باستخدام curl
                console.log('📦 Installing yt-dlp via curl...');
                execSync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /tmp/yt-dlp', { stdio: 'inherit' });
                execSync('chmod a+rx /tmp/yt-dlp', { stdio: 'inherit' });
                execSync('mv /tmp/yt-dlp /usr/local/bin/yt-dlp', { stdio: 'inherit' });
                console.log('✅ yt-dlp installed successfully via curl');
                return true;
            } catch (curlError) {
                console.log('❌ All installation methods failed');
                console.log('💡 Please install yt-dlp manually on your system');
                return false;
            }
        }
    }
}

// تشغيل التحقق عند بدء الخادم
checkAndInstallYtDlp().then(success => {
    if (success) {
        console.log('🎉 yt-dlp is ready to use');
    } else {
        console.log('⚠️ yt-dlp is not available, some features may not work');
    }
});

// Store active downloads for progress tracking
const activeDownloads = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ✅ Health check endpoint محسن
app.get('/health', (req, res) => {
    let ytDlpStatus = 'unknown';
    
    try {
        execSync('yt-dlp --version', { stdio: 'pipe' });
        ytDlpStatus = 'installed';
    } catch (error) {
        ytDlpStatus = 'not-installed';
    }
    
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        port: PORT,
        ytDlp: ytDlpStatus,
        platform: process.platform
    });
});

// ✅ Info endpoint
app.get('/info', (req, res) => {
    res.status(200).json({
        name: 'VidDown Server',
        version: '1.0.0',
        description: 'Download videos from YouTube, Instagram, TikTok, Facebook',
        endpoints: {
            health: '/health',
            info: '/info',
            search: '/search?q=query&platform=youtube',
            trending: '/trending?platform=youtube',
            preview: '/preview',
            download: '/download',
            'convert-audio': '/convert-audio',
            progress: '/progress/:downloadId'
        }
    });
});

// دالة محسنة للحصول على معلومات الفيديو
function getVideoInfo(url) {
    return new Promise((resolve, reject) => {
        if (!url || typeof url !== 'string') {
            reject(new Error('Invalid URL provided'));
            return;
        }

        // التحقق من صحة URL
        try {
            new URL(url);
        } catch {
            reject(new Error('Invalid URL format'));
            return;
        }

        const ytDlp = spawn('yt-dlp', ['--dump-json', '--no-warnings', url], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 30000
        });

        let stdout = '';
        let stderr = '';

        ytDlp.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ytDlp.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ytDlp.on('close', (code) => {
            if (code === 0) {
                try {
                    const info = JSON.parse(stdout.trim());
                    resolve(info);
                } catch (error) {
                    reject(new Error('Failed to parse video information. The URL might not be supported or the video might be private/unavailable.'));
                }
            } else {
                let errorMessage = 'Failed to get video information';
                if (stderr.includes('Video unavailable')) {
                    errorMessage = 'Video is unavailable or private';
                } else if (stderr.includes('Unsupported URL')) {
                    errorMessage = 'This platform is not supported';
                } else if (stderr.includes('Sign in to confirm')) {
                    errorMessage = 'This video requires sign-in to access';
                } else if (stderr.includes('Private video')) {
                    errorMessage = 'This video is private';
                } else if (stderr.includes('Geo-restricted')) {
                    errorMessage = 'This video is geo-restricted in your region';
                }
                reject(new Error(errorMessage));
            }
        });

        ytDlp.on('error', (error) => {
            if (error.code === 'ENOENT') {
                reject(new Error('yt-dlp is not installed. Please install yt-dlp to use this service.'));
            } else {
                reject(new Error(`System error: ${error.message}`));
            }
        });

        // timeout بعد 30 ثانية
        setTimeout(() => {
            if (ytDlp.exitCode === null) {
                ytDlp.kill();
                reject(new Error('Request timed out. Please try again.'));
            }
        }, 30000);
    });
}

// دالة محسنة لتحميل الفيديو
function downloadVideo(url, quality, format = 'mp4', downloadId = null) {
    return new Promise((resolve, reject) => {
        const id = downloadId || crypto.randomUUID();

        let args;
        if (format === 'mp3') {
            args = [
                '--no-playlist',
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '192K',
                '--progress',
                '--newline',
                '--output', '-',
                url
            ];
        } else {
            args = [
                '--no-playlist',
                '--format', `bestvideo[height<=${getMaxHeight(quality)}]+bestaudio/best[height<=${getMaxHeight(quality)}]`,
                '--merge-output-format', format,
                '--progress',
                '--newline',
                '--output', '-',
                url
            ];
        }

        const ytDlp = spawn('yt-dlp', args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // تتبع عملية التحميل
        activeDownloads.set(id, {
            id,
            url,
            quality,
            format,
            status: 'starting',
            progress: 0,
            speed: '0',
            eta: 'Unknown',
            totalSize: 'Unknown',
            downloadedSize: '0',
            startTime: Date.now()
        });

        let buffer = '';

        ytDlp.stderr.on('data', (data) => {
            const output = data.toString();
            buffer += output;

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const progress = parseProgress(line);
                if (progress) {
                    activeDownloads.set(id, {
                        ...activeDownloads.get(id),
                        ...progress,
                        status: 'downloading'
                    });
                }
            }
        });

        ytDlp.on('close', (code) => {
            const download = activeDownloads.get(id);
            if (download) {
                if (code === 0) {
                    activeDownloads.set(id, {
                        ...download,
                        status: 'completed',
                        progress: 100
                    });
                } else {
                    activeDownloads.set(id, {
                        ...download,
                        status: 'failed'
                    });
                }
                // تنظيف بعد 30 ثانية
                setTimeout(() => activeDownloads.delete(id), 30000);
            }
        });

        ytDlp.on('error', (error) => {
            const download = activeDownloads.get(id);
            if (download) {
                activeDownloads.set(id, {
                    ...download,
                    status: 'failed',
                    error: error.message
                });
            }
            reject(error);
        });

        resolve({ process: ytDlp, id });
    });
}

// تحسين تحليل التقدم
function parseProgress(line) {
    const downloadMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
    if (downloadMatch) {
        return {
            progress: parseFloat(downloadMatch[1]),
            totalSize: downloadMatch[2],
            speed: downloadMatch[3],
            eta: downloadMatch[4]
        };
    }

    const completeMatch = line.match(/\[download\]\s+100%\s+of\s+([^\s]+)/);
    if (completeMatch) {
        return {
            progress: 100,
            totalSize: completeMatch[1],
            speed: '0',
            eta: '00:00'
        };
    }

    return null;
}

function getMaxHeight(quality) {
    switch (quality) {
        case 'High (1080p)': return 1080;
        case 'Medium (720p)': return 720;
        case 'Low (480p)': return 480;
        default: return 720;
    }
}

function validateQuality(quality) {
    const validQualities = ['High (1080p)', 'Medium (720p)', 'Low (480p)'];
    return validQualities.includes(quality);
}

function validateFormat(format) {
    const validFormats = ['mp4', 'webm', 'mp3', 'm4a', 'wav', 'flac'];
    return validFormats.includes(format);
}

// ✅ Endpoint لفحص yt-dlp
app.get('/check-ytdlp', (req, res) => {
    try {
        const version = execSync('yt-dlp --version', { encoding: 'utf8' }).trim();
        res.json({ 
            status: 'installed', 
            version: version,
            message: 'yt-dlp is ready to use'
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'not-installed', 
            error: 'yt-dlp is not available',
            message: 'Please install yt-dlp to enable video downloads'
        });
    }
});

// تحسين endpoint التحميل
app.post('/download', async (req, res) => {
    const { url, quality = 'Medium (720p)', format = 'mp4' } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // التحقق من تثبيت yt-dlp أولاً
    try {
        execSync('yt-dlp --version', { stdio: 'pipe' });
    } catch (error) {
        return res.status(500).json({ 
            error: 'yt-dlp is not installed. Please wait for installation to complete or contact administrator.' 
        });
    }

    if (!validateQuality(quality)) {
        return res.status(400).json({
            error: 'Invalid quality. Supported qualities: High (1080p), Medium (720p), Low (480p)'
        });
    }

    if (!validateFormat(format)) {
        return res.status(400).json({
            error: 'Invalid format. Supported formats: mp4, webm, mp3, m4a, wav, flac'
        });
    }

    try {
        const info = await getVideoInfo(url);
        const title = info.title || 'video';
        const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);

        const downloadId = crypto.randomUUID();

        let contentType;
        if (format === 'mp3' || format === 'm4a') {
            contentType = 'audio/mpeg';
        } else if (format === 'wav') {
            contentType = 'audio/wav';
        } else if (format === 'flac') {
            contentType = 'audio/flac';
        } else {
            contentType = 'video/mp4';
        }

        res.header('Content-Type', contentType);
        res.header('Content-Disposition', `attachment; filename="${safeTitle}.${format}"`);
        res.header('X-Download-ID', downloadId);

        const { process: ytDlpProcess } = await downloadVideo(url, quality, format, downloadId);

        ytDlpProcess.stdout.pipe(res);

        ytDlpProcess.on('close', (code) => {
            if (code !== 0 && !res.headersSent) {
                res.status(500).json({ error: 'Download failed. Please check the URL and try again.' });
            }
        });

        ytDlpProcess.on('error', (error) => {
            console.error('yt-dlp error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Download process failed. Please try again.' });
            }
        });

    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Download failed. Please check the URL and try again.' });
        }
    }
});

// الباقي من endpoints يبقى كما هو مع تحسينات بسيطة
app.post('/info', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const info = await getVideoInfo(url);
        res.json({
            title: info.title,
            duration: info.duration,
            uploader: info.uploader,
            view_count: info.view_count,
            thumbnail: info.thumbnail,
            formats: info.formats?.map(f => ({
                format_id: f.format_id,
                ext: f.ext,
                resolution: f.resolution,
                filesize: f.filesize,
                quality: f.quality
            })) || []
        });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to get video info' });
    }
});

// endpoints الأخرى تبقى كما هي...
app.get('/progress/:downloadId', (req, res) => {
    const { downloadId } = req.params;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const download = activeDownloads.get(downloadId);
    if (download) {
        res.write(`data: ${JSON.stringify(download)}\n\n`);
    } else {
        res.write(`data: ${JSON.stringify({ error: 'Download not found' })}\n\n`);
    }

    const interval = setInterval(() => {
        const download = activeDownloads.get(downloadId);
        if (download) {
            res.write(`data: ${JSON.stringify(download)}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify({ error: 'Download not found' })}\n\n`);
            clearInterval(interval);
            res.end();
        }
    }, 1000);

    req.on('close', () => {
        clearInterval(interval);
    });
});

app.post('/convert-audio', async (req, res) => {
    const { url, quality, audioFormat = 'mp3', audioQuality = '192' } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const info = await getVideoInfo(url);
        const title = info.title || 'audio';
        const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);

        const downloadId = crypto.randomUUID();

        res.header('Content-Type', `audio/${audioFormat}`);
        res.header('Content-Disposition', `attachment; filename="${safeTitle}.${audioFormat}"`);
        res.header('X-Download-ID', downloadId);

        const { process: ytDlpProcess } = await downloadVideo(url, quality, audioFormat, downloadId);

        ytDlpProcess.stdout.pipe(res);

        ytDlpProcess.on('close', (code) => {
            if (code !== 0 && !res.headersSent) {
                res.status(500).json({ error: 'Audio conversion failed' });
            }
        });

        ytDlpProcess.on('error', (error) => {
            console.error('Audio conversion error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Audio conversion process failed' });
            }
        });

    } catch (error) {
        console.error('Audio conversion error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Audio conversion failed' });
        }
    }
});

// endpoint الباقية...
app.get('/trending', async (req, res) => {
    // ... الكود الحالي
});

app.get('/search', async (req, res) => {
    // ... الكود الحالي
});

function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('📹 Supports 50+ platforms via yt-dlp');
    console.log(`🌐 Health check available at: http://localhost:${PORT}/health`);
    console.log(`🔍 yt-dlp check available at: http://localhost:${PORT}/check-ytdlp`);
});