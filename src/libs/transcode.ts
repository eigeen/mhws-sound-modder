import { v4 as uuidv4 } from 'uuid'
import { LocalDir } from './localDir'
import { join } from '@tauri-apps/api/path'
import { Transcode } from '@/api/tauri'
import { exists } from '@tauri-apps/plugin-fs'

export type TargetFormat = 'wav' | 'wem'

export class Transcoder {
  private static instance: Transcoder | null = null

  public static getInstance(): Transcoder {
    if (!Transcoder.instance) {
      Transcoder.instance = new Transcoder()
    }
    return Transcoder.instance
  }

  constructor() {}

  /**
   * Transcodes the input file to target format.
   * @returns The path of the transcoded file.
   */
  public async transcode(
    inputPath: string,
    format: TargetFormat
  ): Promise<string> {
    // check if input file exists
    if (!(await exists(inputPath))) {
      throw new Error('Input file does not exist')
    }
    // assign output file path
    const outputFilename = uuidv4() + '.' + format
    const tempDir = await LocalDir.getTempDir()
    const outputPath = await join(tempDir, outputFilename)
    // transcode the file
    await Transcode.autoTranscode(inputPath, outputPath)
    return outputPath
  }
}
