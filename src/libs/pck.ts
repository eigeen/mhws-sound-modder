import { PckApi } from '@/api/tauri'
import type { PckHeader } from '@/models/pck'
import { getFileName } from '@/utils/path'
import { sha256 } from '@/utils'

export class Pck {
  public header: PckHeader
  public name: string = ''
  public filePath: string = ''
  private _hasData: boolean
  private _label: string = ''

  constructor(header: PckHeader, hasData: boolean) {
    this.header = header
    this._hasData = hasData
  }

  public static async load(filePath: string): Promise<Pck> {
    const { header, hasData } = await PckApi.loadBasicData(filePath)
    const pck = new Pck(header, hasData)
    pck.filePath = filePath
    pck.name = getFileName(filePath)
    pck._label = (await sha256(filePath)).substring(0, 8)
    return pck
  }

  public hasData(): boolean {
    return this._hasData
  }

  public getLabel(): string {
    return this._label
  }

  public async extractData(outputDir: string): Promise<void> {
    return PckApi.extractData(this.filePath, outputDir)
  }

  // public async saveFile(outputPath: string): Promise<void> {
  //   if (!this.extractDataDir) {
  //     await this.extractData()
  //   }
  //   return PckApi.saveFile(this.header, this.extractDataDir!, outputPath)
  // }
}
