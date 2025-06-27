# MHWs Sound Modder

A modern cross-platform tool for modding sound files in Monster Hunter: Wilds. Built with Tauri and Vue3.

## Features

- 🎵 Import and export BNK/PCK sound files
- 🌳 Tree view for BNK file structure
- 🔊 Preview audio files directly in the application
- 🎨 Modern and intuitive user interface
- 🛠️ Built-in audio transcoding support (need ffmpeg and vgmstream)

User manual: [English](docs/UserManual.md) | [简体中文](UserManualZhCN.md)

## Installation

1. Download the latest release from the [Releases](https://github.com/eigeen/mhws-sound-modder/releases) page.
2. Unzip downloaded zip file.
3. See [External Components](#external-components) section for required components setup.

## External Components

Most external components can be placed in the application directory, except for `Wwise` which requires installation through the official installer.

- [**FFmpeg**](https://ffmpeg.org): Used for converting non-wav/wem audio formats. This enables importing various audio formats including mp3, aac, flac, etc. [Download](https://ffmpeg.org/download.html).
- [**vgmstream**](https://ffmpeg.org/download.html): Included in the release. Used for converting wem to wav. Without it, audio preview and wav extraction will not be available.
- [**WwiseConsole**](https://www.audiokinetic.com/wwise/overview/): Requires Wwise installation, will be automatically detected. Used for converting wav to wem. Without it, audio importing will not be available.

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm tauri dev

# Build for production
pnpm tauri build
```

### Acknowledgments

- [Tauri](https://tauri.app/) - For the framework
- [Vue.js](https://vuejs.org/) - For the frontend framework
- [Vuetify](https://vuetifyjs.com/) - For the UI components

## License

[MIT License](LICENSE)

## Credits

[bnnm/wwiser](https://github.com/bnnm/wwiser): The best Wwise Bnk parser.
[RaidingForPants/hd2-audio-modder](https://github.com/RaidingForPants/hd2-audio-modder): Inspiration for this app's UI/UX.
