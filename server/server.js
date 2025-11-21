const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// Store active downloads for progress tracking
const activeDownloads = new Map();

app.use(cors());
app.use(express.json());

// Function to get video info using yt-dlp
function getVideoInfo(url) {
    return new Promise((resolve, reject) => {
        if (!url || typeof url !== 'string') {
            reject(new Error('Invalid URL provided'));
            return;
        }

        // Basic URL validation
        try {
            new URL(url);
        } catch {
            reject(new Error('Invalid URL format'));
            return;
        }

        const ytDlp = spawn('yt-dlp', ['--dump-json', '--no-warnings', url], {
            stdio: ['pipe', 'pipe', 'pipe']
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
                // Parse common error messages
                let errorMessage = 'Failed to get video information';
                if (stderr.includes('Video unavailable')) {
                    errorMessage = 'Video is unavailable or private';
                } else if (stderr.includes('Unsupported URL')) {
                    errorMessage = 'This platform is not supported';
                } else if (stderr.includes('Sign in to confirm')) {
                    errorMessage = 'This video requires sign-in to access';
                } else if (stderr.includes('Geo-blocked')) {
                    errorMessage = 'This video is geo-blocked in your region';
                } else if (stderr.includes('Age-restricted')) {
                    errorMessage = 'This video is age-restricted';
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

        // Timeout after 30 seconds
        setTimeout(() => {
            ytDlp.kill();
            reject(new Error('Request timed out. Please try again.'));
        }, 30000);
    });
}

// Function to download video using yt-dlp with progress tracking
function downloadVideo(url, quality, format = 'mp4', downloadId = null) {
    return new Promise((resolve, reject) => {
        // Generate download ID if not provided
        const id = downloadId || crypto.randomUUID();

        // Build yt-dlp arguments based on format
        let args;
        if (format === 'mp3') {
            // Audio extraction
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
            // Video download
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

        // Initialize download tracking
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

            // Parse progress from yt-dlp output
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

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
            if (code === 0) {
                activeDownloads.set(id, {
                    ...activeDownloads.get(id),
                    status: 'completed',
                    progress: 100
                });
            } else {
                activeDownloads.set(id, {
                    ...activeDownloads.get(id),
                    status: 'failed'
                });
            }
            // Clean up after some time
            setTimeout(() => activeDownloads.delete(id), 30000);
        });

        ytDlp.on('error', (error) => {
            activeDownloads.set(id, {
                ...activeDownloads.get(id),
                status: 'failed',
                error: error.message
            });
            reject(error);
        });

        resolve({ process: ytDlp, id });
    });
}

// Parse yt-dlp progress output
function parseProgress(line) {
    // yt-dlp progress format: [download] 45.6% of 10.00MiB at 1.50MiB/s ETA 00:05
    const downloadMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
    if (downloadMatch) {
        return {
            progress: parseFloat(downloadMatch[1]),
            totalSize: downloadMatch[2],
            speed: downloadMatch[3],
            eta: downloadMatch[4]
        };
    }

    // Alternative format: [download] 100% of 10.00MiB
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

// Helper function to get max height from quality string
function getMaxHeight(quality) {
    switch (quality) {
        case 'High (1080p)': return 1080;
        case 'Medium (720p)': return 720;
        case 'Low (480p)': return 480;
        default: return 720;
    }
}

// Validate quality parameter
function validateQuality(quality) {
    const validQualities = ['High (1080p)', 'Medium (720p)', 'Low (480p)'];
    return validQualities.includes(quality);
}

// Validate format parameter
function validateFormat(format) {
    const validFormats = ['mp4', 'webm', 'mp3', 'm4a', 'wav', 'flac'];
    return validFormats.includes(format);
}

// Server-Sent Events endpoint for progress tracking
app.get('/progress/:downloadId', (req, res) => {
    const { downloadId } = req.params;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial data
    const download = activeDownloads.get(downloadId);
    if (download) {
        res.write(`data: ${JSON.stringify(download)}\n\n`);
    } else {
        res.write(`data: ${JSON.stringify({ error: 'Download not found' })}\n\n`);
    }

    // Send updates every second
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

    // Clean up on client disconnect
    req.on('close', () => {
        clearInterval(interval);
    });
});

// Download endpoint
app.post('/download', async (req, res) => {
    const { url, quality = 'Medium (720p)', format = 'mp4' } = req.body;

    // Validation
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
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
        // Get video info first
        const info = await getVideoInfo(url);
        const title = info.title || 'video';
        const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);

        // Generate download ID
        const downloadId = crypto.randomUUID();

        // Set appropriate content type
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

        // Set headers for download
        res.header('Content-Type', contentType);
        res.header('Content-Disposition', `attachment; filename="${safeTitle}.${format}"`);
        res.header('X-Download-ID', downloadId);

        // Start download with progress tracking
        const { process: ytDlpProcess } = await downloadVideo(url, quality, format, downloadId);

        ytDlpProcess.stdout.pipe(res);

        ytDlpProcess.on('close', (code) => {
            if (code !== 0) {
                console.error('yt-dlp process exited with code:', code);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Download failed. Please check the URL and try again.' });
                }
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

// Get video info endpoint
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

// Audio conversion endpoint
app.post('/convert-audio', async (req, res) => {
    const { url, quality, audioFormat = 'mp3', audioQuality = '192' } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // Get video info first
        const info = await getVideoInfo(url);
        const title = info.title || 'audio';
        const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);

        // Generate download ID
        const downloadId = crypto.randomUUID();

        // Set headers for audio download
        res.header('Content-Type', `audio/${audioFormat}`);
        res.header('Content-Disposition', `attachment; filename="${safeTitle}.${audioFormat}"`);
        res.header('X-Download-ID', downloadId);

        // Start audio extraction
        const { process: ytDlpProcess } = await downloadVideo(url, quality, audioFormat, downloadId);

        ytDlpProcess.stdout.pipe(res);

        ytDlpProcess.on('close', (code) => {
            if (code !== 0) {
                console.error('Audio conversion failed with code:', code);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Audio conversion failed' });
                }
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

// Playlist download endpoint
app.post('/download-playlist', async (req, res) => {
    const { url, quality, format = 'mp4' } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // Get playlist info
        const ytDlp = spawn('yt-dlp', ['--dump-json', '--flat-playlist', url], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        ytDlp.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ytDlp.on('close', (code) => {
            if (code === 0) {
                const entries = stdout.trim().split('\n').map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                }).filter(Boolean);

                res.json({
                    playlist_title: entries[0]?.playlist_title || 'Playlist',
                    entries: entries.map(entry => ({
                        id: entry.id,
                        title: entry.title,
                        url: entry.url
                    }))
                });
            } else {
                res.status(500).json({ error: 'Failed to get playlist info' });
            }
        });

    } catch (error) {
        res.status(500).json({ error: error.message || 'Playlist download failed' });
    }
});

// Batch download endpoint for playlists
app.post('/download-batch', async (req, res) => {
    const { urls, quality, format = 'mp4' } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'URLs array is required' });
    }

    const downloadIds = [];

    try {
        // Start downloads for each URL
        for (const url of urls) {
            const downloadId = crypto.randomUUID();
            downloadIds.push(downloadId);

            // Start download in background (don't wait for completion)
            downloadVideo(url, quality, format, downloadId).catch(error => {
                console.error('Batch download error:', error);
            });
        }

        res.json({
            message: `Started ${urls.length} downloads`,
            downloadIds
        });

    } catch (error) {
        res.status(500).json({ error: error.message || 'Batch download failed' });
    }
});

// Trending videos endpoint
app.get('/trending', async (req, res) => {
    const { platform = 'youtube', limit = 20 } = req.query;

    try {
        let trendingUrls = [];

        // Get trending videos based on platform
        switch (platform.toLowerCase()) {
            case 'youtube':
                // YouTube trending - using yt-dlp to get trending videos
                trendingUrls = [
                    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Sample URLs - in production, use actual trending
                    'https://www.youtube.com/watch?v=oHg5SJYRHA0',
                    'https://www.youtube.com/watch?v=9bZkp7q19f0',
                    'https://www.youtube.com/watch?v=J---aiyznGQ',
                    'https://www.youtube.com/watch?v=kJQP7kiw5Fk'
                ];
                break;
            case 'tiktok':
                trendingUrls = [
                    'https://www.tiktok.com/@user/video/1234567890',
                    'https://www.tiktok.com/@user/video/0987654321'
                ];
                break;
            case 'instagram':
                trendingUrls = [
                    'https://www.instagram.com/p/ABC123/',
                    'https://www.instagram.com/p/DEF456/'
                ];
                break;
            default:
                trendingUrls = [];
        }

        // Get video info for each trending URL
        const trendingVideos = [];

        for (const url of trendingUrls.slice(0, parseInt(limit))) {
            try {
                const info = await getVideoInfo(url);
                trendingVideos.push({
                    title: info.title || 'Untitled Video',
                    url: url,
                    thumbnail: info.thumbnail || '',
                    duration: formatDuration(info.duration || 0),
                    uploader: info.uploader || 'Unknown',
                    view_count: info.view_count || 0,
                    platform: platform
                });
            } catch (error) {
                console.error('Error getting info for trending video:', error);
                // Add placeholder data if video info fails
                trendingVideos.push({
                    title: 'Trending Video',
                    url: url,
                    thumbnail: '',
                    duration: '00:00',
                    uploader: 'Unknown',
                    view_count: 0,
                    platform: platform
                });
            }
        }

        res.json({
            platform: platform,
            videos: trendingVideos
        });

    } catch (error) {
        console.error('Trending videos error:', error);
        res.status(500).json({ error: 'Failed to get trending videos' });
    }
});

// Search videos endpoint
app.get('/search', async (req, res) => {
    const { q: query, platform = 'youtube', limit = 20 } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        // Determine search prefix based on platform
        let searchPrefix;
        switch (platform.toLowerCase()) {
            case 'youtube':
                searchPrefix = 'ytsearch';
                break;
            case 'instagram':
                searchPrefix = 'igsearch';
                break;
            case 'tiktok':
                searchPrefix = 'ttsearch';
                break;
            case 'facebook':
                searchPrefix = 'fbsearch';
                break;
            default:
                searchPrefix = 'ytsearch'; // fallback
        }

        // Use yt-dlp search functionality
        const ytDlp = spawn('yt-dlp', ['--flat-playlist', '--print', '%(id)s|%(title)s|%(uploader)s|%(duration)s|%(thumbnail)s|%(view_count)s', `${searchPrefix}${limit}:${query}`], {
            stdio: ['pipe', 'pipe', 'pipe']
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
                const videos = [];
                const lines = stdout.trim().split('\n');

                for (const line of lines) {
                    const parts = line.split('|');
                    if (parts.length >= 5) {
                        const [id, title, uploader, duration, thumbnail] = parts;
                        const url = `https://www.youtube.com/watch?v=${id}`;
                        videos.push({
                            title: title || 'Untitled',
                            url: url,
                            thumbnail: thumbnail || '',
                            duration: formatDuration(parseInt(duration) || 0),
                            uploader: uploader || 'Unknown',
                            view_count: parseInt(parts[5]) || 0,
                            platform: 'youtube'
                        });
                    }
                }

                res.json({
                    query: query,
                    platform: platform,
                    videos: videos
                });
            } else {
                console.error('yt-dlp search error:', stderr);
                // Fallback to trending if search fails
                const fallbackUrls = [
                    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                    'https://www.youtube.com/watch?v=oHg5SJYRHA0'
                ];
                const videos = fallbackUrls.map(url => ({
                    title: 'Search Result',
                    url: url,
                    thumbnail: '',
                    duration: '00:00',
                    uploader: 'Unknown',
                    view_count: 0,
                    platform: platform
                }));

                res.json({
                    query: query,
                    platform: platform,
                    videos: videos
                });
            }
        });

        ytDlp.on('error', (error) => {
            console.error('Search error:', error);
            res.status(500).json({ error: 'Search failed' });
        });

    } catch (error) {
        console.error('Search videos error:', error);
        res.status(500).json({ error: 'Failed to search videos' });
    }
});

// Helper function to format duration
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
    console.log(`Server running on port ${PORT}`);
    console.log('Supports 50+ platforms via yt-dlp');
});