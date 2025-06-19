import { join } from '@tauri-apps/api/path'
import { writeTextFile } from '@tauri-apps/plugin-fs'

export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  data?: any
}

export class ExportLogger {
  private logs: LogEntry[] = []
  private startTime: Date | null = null
  private endTime: Date | null = null
  private isActive = false
  private logDir: string | null = null
  private logFileName: string | null = null

  /**
   * 开始记录日志
   * @param logDir 日志文件保存目录（可选）
   * @param fileName 日志文件名（不包含扩展名，可选）
   */
  start(logDir?: string, fileName?: string): void {
    this.logs = []
    this.startTime = new Date()
    this.endTime = null
    this.isActive = true

    if (logDir) {
      this.logDir = logDir
      this.logFileName = fileName || this.generateDefaultFileName()
    }

    this.log('info', 'Export process started')
  }

  /**
   * 设置日志保存目录
   * @param logDir 日志文件保存目录
   * @param fileName 日志文件名（不包含扩展名，可选）
   */
  setLogDirectory(logDir: string, fileName?: string): void {
    this.logDir = logDir
    this.logFileName = fileName || this.generateDefaultFileName()
    this.log('info', `Log directory set: ${logDir}`)
  }

  /**
   * 生成默认日志文件名
   */
  private generateDefaultFileName(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19)
    return `export-log-${timestamp}`
  }

  /**
   * 结束记录日志并保存文件
   */
  async end(): Promise<void> {
    if (!this.isActive) return

    this.endTime = new Date()
    this.isActive = false
    console.info('[ExportLogger] Export process completed')

    // 如果有指定目录，则保存日志文件
    if (this.logDir && this.logFileName) {
      try {
        await this.saveLogFiles()
      } catch (error) {
        console.error('Failed to save log files:', error)
      }
    }
  }

  /**
   * 结束记录日志但不保存文件
   */
  terminate(): void {
    if (!this.isActive) return

    this.endTime = new Date()
    this.isActive = false
    console.info('[ExportLogger] Export process terminated')
  }

  /**
   * 保存日志文件
   */
  private async saveLogFiles(): Promise<void> {
    if (!this.logDir || !this.logFileName) return

    try {
      // 生成文本格式日志
      const textLogPath = await join(this.logDir, `${this.logFileName}.txt`)
      const textLogContent = this.exportToText()
      await writeTextFile(textLogPath, textLogContent)
      console.info(`[ExportLogger] Text log file generated: ${textLogPath}`)
    } catch (error) {
      console.error('[ExportLogger] Failed to generate log files', { error })
      throw error
    }
  }

  /**
   * 记录日志
   */
  log(level: LogEntry['level'], message: string, data?: any): void {
    if (!this.isActive) {
      console.warn('Logger is not active, call start() first')
      return
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    }

    this.logs.push(entry)

    // 同时输出到控制台
    const consoleMethod =
      level === 'error'
        ? 'error'
        : level === 'warn'
          ? 'warn'
          : level === 'debug'
            ? 'debug'
            : 'log'
    console[consoleMethod](
      `[${entry.timestamp}] ${level.toUpperCase()}: ${message}`,
      data || ''
    )
  }

  /**
   * 记录信息日志
   */
  info(message: string, data?: any): void {
    this.log('info', message, data)
  }

  /**
   * 记录警告日志
   */
  warn(message: string, data?: any): void {
    this.log('warn', message, data)
  }

  /**
   * 记录错误日志
   */
  error(message: string, data?: any): void {
    this.log('error', message, data)
  }

  /**
   * 记录调试日志
   */
  debug(message: string, data?: any): void {
    this.log('debug', message, data)
  }

  /**
   * 获取所有日志
   */
  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  /**
   * 获取日志统计信息
   */
  getStats() {
    const total = this.logs.length
    const info = this.logs.filter((log) => log.level === 'info').length
    const warn = this.logs.filter((log) => log.level === 'warn').length
    const error = this.logs.filter((log) => log.level === 'error').length
    const debug = this.logs.filter((log) => log.level === 'debug').length

    return {
      total,
      info,
      warn,
      error,
      debug,
      startTime: this.startTime,
      endTime: this.endTime,
      duration:
        this.startTime && this.endTime
          ? this.endTime.getTime() - this.startTime.getTime()
          : null,
    }
  }

  /**
   * 导出日志为纯文本格式
   */
  exportToText(): string {
    const stats = this.getStats()
    let text = `Export Log Report\n`
    text += `================\n\n`
    text += `Start Time: ${this.startTime?.toISOString() || 'N/A'}\n`
    text += `End Time: ${this.endTime?.toISOString() || 'N/A'}\n`
    text += `Duration: ${stats.duration ? `${stats.duration}ms` : 'N/A'}\n\n`
    text += `Statistics:\n`
    text += `- Total: ${stats.total}\n`
    text += `- Info: ${stats.info}\n`
    text += `- Warn: ${stats.warn}\n`
    text += `- Error: ${stats.error}\n`
    text += `- Debug: ${stats.debug}\n\n`
    text += `Log Entries:\n`
    text += `============\n\n`

    this.logs.forEach((log, index) => {
      text += `[${index + 1}] ${log.timestamp} [${log.level.toUpperCase()}] ${log.message}\n`
      if (log.data) {
        text += `    Data: ${JSON.stringify(log.data, null, 2)}\n`
      }
    })

    return text
  }

  /**
   * 清空日志
   */
  clear(): void {
    this.logs = []
    this.startTime = null
    this.endTime = null
    this.isActive = false
    this.logDir = null
    this.logFileName = null
  }

  /**
   * 检查是否正在记录
   */
  isRecording(): boolean {
    return this.isActive
  }

  /**
   * 获取日志文件路径信息
   */
  getLogFileInfo() {
    return {
      logDir: this.logDir,
      logFileName: this.logFileName,
      willSaveFiles: this.logDir !== null && this.logFileName !== null,
    }
  }
}

// 全局日志实例
export const exportLogger = new ExportLogger()
