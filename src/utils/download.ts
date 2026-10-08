import { resolvePlayableAudioUrl } from './audioUrl';

/**
 * Utility to reliably download audio files in browser without navigating away
 * or failing on Vercel Serverless proxy payload limits.
 */
export async function downloadAudioFile(rawAudioUrl: string, title?: string): Promise<boolean> {
  const audioUrl = resolvePlayableAudioUrl(rawAudioUrl);
  if (!audioUrl) return false;

  const cleanTitle = (title || 'sonic-hub-music')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim();
  const filename = cleanTitle.toLowerCase().endsWith('.mp3') 
    ? cleanTitle 
    : `${cleanTitle}.mp3`;

  try {
    // 1. Direct fetch as Blob (fastest and ensures custom filename is respected)
    const response = await fetch(audioUrl, { mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
      return true;
    }
  } catch (blobErr) {
    console.warn('[Download] Direct blob fetch note:', blobErr);
  }

  // 2. Direct Anchor trigger fallback
  try {
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (fallbackErr) {
    console.error('[Download] Anchor fallback failed:', fallbackErr);
    // 3. Absolute last resort: open URL
    window.open(audioUrl, '_blank');
    return false;
  }
}
