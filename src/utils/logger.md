# 导出日志模块

## 概述

`ExportLogger` 是一个专门用于记录导出过程详细日志的模块。它支持多种日志级别，可以导出为JSON和纯文本格式，并包含时间戳和统计信息。日志文件的生成已完全封装到模块内部。

## 主要功能

- **时间戳记录**: 每条日志都包含精确的时间戳
- **多级别日志**: 支持 info、warn、error、debug 四个级别
- **结构化数据**: 支持记录额外的结构化数据
- **统计信息**: 自动统计各级别日志数量和处理时间
- **多种导出格式**: 支持JSON和纯文本两种导出格式
- **控制台输出**: 日志同时输出到控制台，便于调试
- **自动文件生成**: 日志文件生成完全封装在模块内部
- **灵活的结束方式**: 支持保存文件和不保存文件两种结束方式

## 使用方法

### 基本使用

```typescript
import { exportLogger } from '@/utils/logger'

// 开始记录日志（不指定目录）
exportLogger.start()

try {
  // 记录各种级别的日志
  exportLogger.info('Starting task processing')
  exportLogger.debug('Debug information', { data: 'some data' })
  exportLogger.warn('Warning message')
  
  // 执行一些操作...
  
  // 后续设置日志保存目录
  exportLogger.setLogDirectory('/path/to/log/directory')
  
  exportLogger.info('Task completed')
} catch (error) {
  exportLogger.error('Error occurred', { error })
} finally {
  // 结束日志记录并保存文件
  await exportLogger.end()
}
```

### 开始时就指定目录

```typescript
// 开始记录日志时就指定保存目录
exportLogger.start('/path/to/log/directory')

// 记录日志...

// 结束日志记录并保存文件
await exportLogger.end()
```

### 指定自定义文件名

```typescript
// 使用自定义文件名
exportLogger.setLogDirectory('/path/to/log/directory', 'my-custom-log')

// 使用默认文件名（包含时间戳）
exportLogger.setLogDirectory('/path/to/log/directory')
```

### 不保存文件的结束方式

```typescript
// 开始记录日志但不指定目录
exportLogger.start()

// 记录日志...

// 结束记录但不保存文件
exportLogger.terminate()
```

### 获取日志文件信息

```typescript
const fileInfo = exportLogger.getLogFileInfo()
console.log('Log file info:', {
  logDir: fileInfo.logDir,           // 日志目录
  logFileName: fileInfo.logFileName, // 日志文件名
  willSaveFiles: fileInfo.willSaveFiles // 是否会保存文件
})
```

### 手动导出日志（不保存文件时）

```typescript
// 获取JSON格式日志
const jsonLog = exportLogger.exportToJsonl()

// 获取纯文本格式日志
const textLog = exportLogger.exportToText()

// 手动保存到文件
await writeTextFile('export-log.json', jsonLog)
await writeTextFile('export-log.txt', textLog)
```

### 获取统计信息

```typescript
const stats = exportLogger.getStats()
console.log('Log statistics:', {
  total: stats.total,        // 总日志数
  info: stats.info,          // 信息日志数
  warn: stats.warn,          // 警告日志数
  error: stats.error,        // 错误日志数
  debug: stats.debug,        // 调试日志数
  duration: stats.duration   // 处理时间(毫秒)
})
```

## API 参考

### ExportLogger 类

#### 方法

- `start(logDir?: string, fileName?: string)`: 开始记录日志
  - `logDir`: 日志文件保存目录（可选）
  - `fileName`: 日志文件名，不包含扩展名（可选，默认自动生成）
- `setLogDirectory(logDir: string, fileName?: string)`: 设置日志保存目录和文件名
  - `logDir`: 日志文件保存目录
  - `fileName`: 日志文件名，不包含扩展名（可选，默认自动生成）
- `async end()`: 结束记录日志并保存文件（如果指定了目录）
- `terminate()`: 结束记录日志但不保存文件
- `log(level, message, data?)`: 记录指定级别的日志
- `info(message, data?)`: 记录信息日志
- `warn(message, data?)`: 记录警告日志
- `error(message, data?)`: 记录错误日志
- `debug(message, data?)`: 记录调试日志
- `getLogs()`: 获取所有日志条目
- `getStats()`: 获取日志统计信息
- `exportToJsonl()`: 导出为JSON格式
- `exportToText()`: 导出为纯文本格式
- `clear()`: 清空所有日志
- `isRecording()`: 检查是否正在记录
- `getLogFileInfo()`: 获取日志文件路径信息

### LogEntry 接口

```typescript
interface LogEntry {
  timestamp: string    // ISO格式时间戳
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string      // 日志消息
  data?: any          // 可选的附加数据
}
```

## 日志格式示例

### JSON格式输出

```json
{
  "metadata": {
    "exportTime": "2024-01-01T12:00:00.000Z",
    "stats": {
      "total": 5,
      "info": 3,
      "warn": 1,
      "error": 0,
      "debug": 1,
      "startTime": "2024-01-01T12:00:00.000Z",
      "endTime": "2024-01-01T12:00:01.000Z",
      "duration": 1000
    },
    "version": "1.0"
  },
  "logs": [
    {
      "timestamp": "2024-01-01T12:00:00.000Z",
      "level": "info",
      "message": "Export process started"
    },
    {
      "timestamp": "2024-01-01T12:00:00.100Z",
      "level": "info",
      "message": "Starting task processing"
    }
  ]
}
```

### 纯文本格式输出

```
Export Log Report
================

Start Time: 2024-01-01T12:00:00.000Z
End Time: 2024-01-01T12:00:01.000Z
Duration: 1000ms

Statistics:
- Total: 5
- Info: 3
- Warn: 1
- Error: 0
- Debug: 1

Log Entries:
============

[1] 2024-01-01T12:00:00.000Z [INFO] Export process started

[2] 2024-01-01T12:00:00.100Z [INFO] Starting task processing

[3] 2024-01-01T12:00:00.200Z [DEBUG] Debug information
    Data: {"data":"some data"}

[4] 2024-01-01T12:00:00.300Z [WARN] Warning message

[5] 2024-01-01T12:00:01.000Z [INFO] Export process completed
```

## 注意事项

1. **生命周期管理**: 使用前必须调用 `start()`，使用后必须调用 `end()` 或 `terminate()`
2. **文件保存**: 只有在 `start()` 时指定了目录，`end()` 才会保存文件
3. **异步操作**: `end()` 方法是异步的，需要使用 `await`
4. **内存管理**: 日志会保存在内存中，大量日志可能影响性能
5. **并发安全**: 当前实现不是线程安全的，不建议在多线程环境中使用
6. **文件命名**: 如果不指定文件名，会自动生成包含时间戳的文件名

## 集成到导出功能

日志模块已经集成到 `handleExport` 函数中，会自动记录：

- 导出开始和结束时间
- 需要导出的文件列表
- 每个文件的处理过程
- 音源替换的详细信息
- 错误和警告信息
- 最终统计结果

日志文件会自动保存到导出目录，文件名格式为：
- `export-log-YYYY-MM-DDTHH-MM-SS.json`
- `export-log-YYYY-MM-DDTHH-MM-SS.txt`

### 在导出功能中的使用示例

```typescript
async function handleExport() {
  try {
    // 开始记录日志（不指定目录）
    exportLogger.start()
    exportLogger.info('Export process started')
    
    // 检查需要导出的文件
    exportLogger.debug('Checking for files to export')
    // ... 检查逻辑 ...
    
    if (noFilesToExport) {
      exportLogger.warn('No files to export')
      exportLogger.terminate()
      return
    }
    
    // 选择导出目录
    const exportDir = await openDialog({ directory: true })
    if (!exportDir) {
      exportLogger.warn('User cancelled directory selection')
      exportLogger.terminate()
      return
    }
    
    // 设置日志保存目录
    exportLogger.setLogDirectory(exportDir)
    exportLogger.info(`Export directory selected: ${exportDir}`)
    
    // 执行导出操作...
    
    // 结束日志记录并保存文件
    await exportLogger.end()
    
  } catch (err) {
    // 发生错误时，结束记录并保存文件（如果有目录）
    await exportLogger.end()
  }
}
``` 