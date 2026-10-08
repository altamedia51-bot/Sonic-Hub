/**
 * Utility to reliably resolve the permanent, playable MP3 URL for a track.
 * 
 * Background:
 * KIE.ai Suno API returns two types of audio endpoints:
 * 1. stream_audio_url (e.g. https://audiostream.kie.ai/stream/<uuid>.mp3):
 *    - This is an ephemeral live-rendering stream session intended only for real-time preview chunks.
 *    - Once generation finishes or the stream worker closes (TTL few minutes), this URL returns 0 bytes or stalls.
 * 2. audio_url (e.g. https://tempfile.aiquickdraw.com/r/<uuid>.mp3 or Suno CDN):
 *    - This is the permanent, complete rendered MP3 file (~3.5MB - 6MB).
 *    - Has Accept-Ranges: bytes, CORS enabled, and long-term CDN persistence.
 */

export function resolvePlayableAudioUrl(
  input?: string | { audioUrl?: string; streamAudioUrl?: string } | null
): string {
  if (!input) return '';

  let audioUrl = '';
  let streamAudioUrl = '';

  if (typeof input === 'string') {
    audioUrl = input.trim();
  } else {
    audioUrl = (input.audioUrl || '').trim();
    streamAudioUrl = (input.streamAudioUrl || '').trim();
  }

  // 1. If audioUrl is available and is NOT an audiostream link, use it immediately (permanent file)
  if (audioUrl && !audioUrl.includes('audiostream.kie.ai')) {
    return audioUrl;
  }

  // 2. If audioUrl or streamAudioUrl is an audiostream.kie.ai link, extract the UUID
  // and map to the permanent tempfile CDN URL where the full MP3 is hosted
  const candidate = audioUrl || streamAudioUrl;
  const match = candidate.match(/audiostream\.kie\.ai\/stream\/([a-f0-9-]+)\.mp3/i);
  if (match && match[1]) {
    return `https://tempfile.aiquickdraw.com/r/${match[1]}.mp3`;
  }

  // 3. Fallback
  return audioUrl || streamAudioUrl || '';
}
