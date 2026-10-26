# Apple TV music control (0.5.15)

Copyright (c) 2026 Adms Chung. SPDX-License-Identifier: Apache-2.0.

Music runs on the paired Apple TV, through TV optical output to Caruso. Spotify/Music must be installed and signed in on Apple TV. No Spotify Developer App setup or Mac Spotify/Music automation is required.

## Main player

When the receiver confirms power on and OPTICAL, the main player routes Play, Pause, Next and Previous to Apple TV. This path requires only the saved Companion pairing. It does not require a developer screenshot connection, an active preview, a chosen provider, or a music app relaunch. Play/Pause uses fresh Apple TV metadata when available; a separate Pause button remains available. It never infers Apple TV playback from Caruso LUCI status. Other receiver sources retain their existing native transport controls.

Apple TV's media commands control its current media queue. They do not select a Spotify or Apple Music song by themselves. The UI shows Apple TV title, artist, album, position, duration and artwork only while metadata is fresh (15 seconds). It does not reuse receiver track data for optical input. Play/Pause commands wait up to 2.5 seconds for a new matching playback report before claiming state confirmation. A command acknowledgement is not proof of audible playback.

## Selection preview

The Spotify and Apple Music selection buttons open the chosen TV app and confirm Caruso's optical source. They do not automatically resume a global queue, which could belong to another app. The selection tab offers a screenshot preview, directional/Select/Back controls and text entry. The preview is a snapshot, not an interactive video stream or an independent catalogue. First select the actual TV search field before entering text. Companion keyboard focus and text readback must match.

The developer screen helper uses the existing pinned developer pairing and a shared nonblocking device-operation lock. It launches only the two music apps without killing them. Screenshots are bounded, resized locally and returned through private temporary files that are removed. An expired screenshot session reconnects without relaunching music or repeating a media key. Closing the preview or Mac app does not send pause, stop or power-off; the Mac is not the music streamer.

## Security

Both desktop and local browser views use the same HTTP route, with Host, Origin, fetch-site, session-token and request-size checks. The route is not exposed by the messages-only external relay. Commands and keys use fixed allowlists. Search text is JSON data, never executable code. Errors identify the failed stage without emitting credentials, device identifiers or raw native exceptions. Existing Python runtimes and developer pairing are local installation prerequisites, not a bundled redistributable runtime.

## Evidence and boundaries

Investigation of installed 0.5.8 found that its separate preview could open Spotify and confirm optical, but the main player remained disabled because optical transport was still routed to the receiver. Spotify was paused; an explicit Apple TV Play changed the screen to a pause icon and advanced progress. Apple Music's personal home screen also loaded. A global Play after opening Music could continue the previous Spotify queue, so it was removed from selection buttons.

Automated tests cover receiver-before-launch checks, no blind resume, input allowlists, expired screen recovery, local stop without pausing, direct transport without preview, and refusal when power/source is unconfirmed. Device command acknowledgements, mock tests and screenshots do not establish audible output or complete catalogue-search acceptance.

## Artwork and current media

The read-only metadata worker uses the separately paired AirPlay/MRP tunnel, not an audio stream. It polls current media every two seconds and fetches 512-pixel artwork only on track changes or a bounded missing-art retry. It performs no power, launch, transport or pairing actions. Device matching is limited to the configured private host/name, with existing saved credentials. Metadata disconnect clears artwork/title immediately; stale data does not drive playback toggles. The worker is stopped on app exit and reconnects at a 30-second interval. See [pyatv metadata documentation](https://pyatv.dev/development/metadata/) for protocol support.

Artwork accepts bounded inline JPEG, PNG, GIF or WebP only; arbitrary image URLs, SVG and raw native errors are not forwarded. The app renders text with textContent. During confirmed playback, the cover uses a subtle zoom animation that stops on pause and respects reduced-motion preferences. This is an app animation applied to the returned cover image, not an assertion that a music service's original animated-cover video is available.

Media-data pairing requires explicit local user authorization. Credentials remain in the local mode-0600 pairing file; pairing screenshots and temporary PIN images are removed. Pairing grants access to current title, artist, duration, position and artwork.

## Apple Music validation and artwork presentation (0.5.15)

Provider validation requires selecting an Apple Music track and observing fresh `com.apple.TVMusic` reports with matching artwork and advancing position. This is distinct from merely opening Music while a Spotify queue continues. Provider-specific preview media buttons now refuse another app's queue or stale/unavailable provider data. Generic main-player buttons continue to control the explicitly displayed current Apple TV media source.

Apple Music returned valid artwork bytes with an empty MIME field. Header-based JPEG/PNG/GIF/WebP detection recovers those images while refusing SVG/HTML/unknown data; no external artwork URL fallback is needed. Companion navigation waits 250 ms before closing its session so key events can settle. If a key was delivered but the following screenshot fails, the app reports the preview failure separately and does not repeat the key or show a stale screenshot.

The artwork is twice the previous default width (234 px vs 117 px at 1040x732), clipped inside a fixed circular disc. Playback enables a 16-second, 4.5-percent breathing zoom, rotating neon rim and soft glow; pause stops them. Smaller windows adapt to available space. All motion respects reduced-motion preferences.

The initial decorative spectrum was superseded by file-based analysis after the user requested actual changing frequency bars and explicitly chose files instead of microphone input. Without a matching local file, all bars remain flat and the UI asks for that track's file. No artificial amplitude profile is shown.

## Local-file frequency analysis

The file picker reads a user-selected audio file locally in the renderer. OfflineAudioContext decodes it without playing or uploading it. A 4096-point Hann-windowed FFT drives 72 logarithmic frequency bands from 40 Hz to the lower of 16 kHz and the file's Nyquist frequency. Stereo bands use the higher channel energy to avoid mono phase cancellation. Attack/release smoothing affects visual response only; no random heights or microphone data are used.

A local file is tied to the current app/song/artist/album/duration identity and must match the reported duration within two seconds. The user must select the same recording/version; duration alone is not proof of recording identity. The playhead follows fresh Apple TV position with bounded interpolation, freezes on pause, and unbinds the file when the song changes. Files are limited to 100 MiB and 15 minutes. Unsupported/protected audio cannot be decoded and is reported without attempting decryption.

Apple TV's existing remote/metadata connection does not deliver its complete music file, so this implementation does not claim a live FFT for the current cloud-streamed Apple Music song. Synthetic PCM-file tests verify 440 Hz versus 4 kHz band movement and silence; that evidence is separate from the successful physical Apple Music selection/cover/progress tests.


## Automatically synchronized lyrics (macOS 0.5.31)

The main player shows the previous, current and next timed lyric, plus a glowing bar representing the current song position reported by Apple TV. The bar remains available with missing lyrics or with the sand canvas switched off. This is a **lyrics-synchronized effect, not an audio spectrum or a measured beat**. Playback remains on Apple TV. No microphone, audio file import, playback-source change or additional account authorization is required.

Lyrics are queried from [LRCLIB](https://lrclib.net/docs) using the current track title, artist, album and duration. The provider receives these query fields and the normal network connection information; no audio or Apple TV pairing credentials are sent. The app identifies itself with its project URL, matches title/artist and duration within two seconds, prefers the matching album, and caches successful/negative matches locally. Network errors and rate limits cause backoff. Lyrics are rendered as text, never HTML.

Pause freezes the light; forward/backward seeks select the corresponding timed line; a track change immediately clears old lyrics. Empty LRC lines mark instrumental gaps. Missing, untimed, unsupported-offset or mismatched lyrics and provider failures display a clear status while retaining the selected decorative Zen Sand visual. Stale/disconnected metadata leaves all lyric lights inactive. Plain lyrics are not assigned invented timestamps. The display is line-synchronized; it does not claim word-level karaoke accuracy.

Cache: `lyrics-cache.json` in the app's local user-data directory, mode 0600. The cache is bounded and contains track matching data and lyrics, not audio or credentials.

### Zen Sand Art Flow

The former bar visualization is hidden. A compact **霓虹沙畫 / 關閉** switch selects the neon Zen Sand canvas or turns the effect off; the choice persists locally across launches. The default is Zen Sand. Each stroke draws seven parallel rake grooves together. Its independently selected speed and width range from 1 to 3 times the original baseline, stay fixed until that stroke completes, and are deterministic for the same song and stroke. At baseline speed a stroke spans four beats; the selected multiplier shortens that duration. Randomly sized arcs and flowing ripples vary in centre, span, scale and wavelength, can overlap, and deliberately extend outside the band for natural clipping. Every guide starts left of the canvas and ends beyond the right edge, with an overscan margin larger than all seven groove offsets and their grain fringe; no normal completed stroke ends inside the visible band. A bounded trail of four groups retains old marks and gradually fades them. Soft underglow, a diffuse sand bed, and deterministic scattered grains to either side replace sharp laser-like contour lines. Between metadata polls, a local clock continues drawing while playback remains fresh; pausing freezes the canvas, and seeking resets its drawing beat. The UI identifies supplied BPM or explicitly labels the default 90 BPM. It is a decorative visual, not a real audio spectrum or a claimed BPM/melody analysis. Playback time drives the drift: pause freezes it, seek follows the new position, and stale/disconnected metadata clears it. Reduced-motion mode retains a still sand pattern. Rendering uses a small bounded canvas with device scale capped at 2; hidden/inactive effects do not draw. Timed lyrics remain visible in either mode.

### Slow artwork rotation

The circular artwork rotates clockwise once every **90 seconds** during confirmed playback. This is an intentionally comfortable decorative speed, rather than real record RPM. The inner image zooms by 12% and the entire circular record grows by 5.5% in a synchronized 16-second deep breath: 6.4-second inhale, a short hold, slow exhale and a short rest. These transforms live on separate elements from the 90-second disc rotation, so they do not overwrite one another. Pause/stop returns the disc to upright over 2.4 seconds by the shortest arc; resuming during that return continues smoothly from the visible angle. Reduced-motion mode disables the spin and immediately restores upright artwork. No player command is issued by the animation.
