"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Upload,
  Download,
  Trash2,
  FileArchive,
  FileText,
  CheckCircle,
  Languages,
  ArrowRight,
  AlertTriangle,
  Clock,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { TranslationLogs } from "@/components/translation-logs"
import { APIConfiguration } from "@/components/api-configuration"

interface TranslationProgress {
  current: number
  total: number
  type: "html" | "xml" | "ipynb"
  message: string
}

interface LogEntry {
  message: string
  level: "info" | "success" | "warning" | "error"
  timestamp: Date
}

interface ArchiveFile {
  filename: string
  modTime: string
  size: number
  type: "original" | "translated"
  translationTime?: string // НОВОЕ ПОЛЕ
}

interface AIConfig {
  provider: "openai" | "gemini" | "ollama"
  apiKey?: string
  model: string
  ollamaUrl?: string
}

export default function ArchiveTranslator() {
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: "openai",
    model: "gpt-4o-mini",
  })
  const [targetLanguage, setTargetLanguage] = useState("Ukrainian")
  const [customLanguage, setCustomLanguage] = useState("")
  const [isTranslating, setIsTranslating] = useState(false)
  const [progress, setProgress] = useState<TranslationProgress | null>(null)
  const [originalFiles, setOriginalFiles] = useState<ArchiveFile[]>([])
  const [translatedFiles, setTranslatedFiles] = useState<ArchiveFile[]>([])
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [translatedFilename, setTranslatedFilename] = useState<string | null>(null)
  const [translationError, setTranslationError] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsVisible, setLogsVisible] = useState(false)
  const [translationTime, setTranslationTime] = useState<string | null>(null) // НОВОЕ СОСТОЯНИЕ
  const fileInputRef = useRef<HTMLInputElement>(null)

  const languageOptions = ["Ukrainian", "English", "French", "Spanish", "Russian", "Other language"]

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const validExtensions = [".tar.gz", ".tar", ".gz", ".ipynb"]
      const isValid = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))

      if (isValid) {
        setUploadedFile(file)
        setTranslatedFilename(null)
        setTranslationError(null)
        setLogs([])
        setTranslationTime(null)
        toast({
          title: "File selected",
          description: `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB) ready for upload`,
        })
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a .tar.gz archive or .ipynb notebook",
          variant: "destructive",
        })
      }
    }
  }

  const handleTranslation = async () => {
    if (!uploadedFile) {
      toast({
        title: "Missing file",
        description: "Please upload a file first",
        variant: "destructive",
      })
      return
    }

    // Проверка конфигурации AI
    if ((aiConfig.provider === "openai" || aiConfig.provider === "gemini") && !aiConfig.apiKey) {
      toast({
        title: "Missing API key",
        description: `Please enter your ${aiConfig.provider.toUpperCase()} API key`,
        variant: "destructive",
      })
      return
    }

    const finalLanguage = targetLanguage === "Other language" ? customLanguage : targetLanguage
    if (!finalLanguage) {
      toast({
        title: "Language required",
        description: "Please select or enter a target language",
        variant: "destructive",
      })
      return
    }

    setIsTranslating(true)
    setProgress({ current: 0, total: 100, type: "html", message: "Starting translation..." })
    setTranslatedFilename(null)
    setTranslationError(null)
    setLogs([])
    setLogsVisible(false)
    setTranslationTime(null)

    const startTime = Date.now() // НАЧАЛО ТАЙМЕРА

    try {
      const formData = new FormData()
      formData.append("file", uploadedFile)
      formData.append("provider", aiConfig.provider)
      formData.append("model", aiConfig.model)
      formData.append("targetLanguage", finalLanguage)

      if ((aiConfig.provider === "openai" || aiConfig.provider === "gemini") && aiConfig.apiKey) {
        formData.append("apiKey", aiConfig.apiKey)
      }
      if (aiConfig.provider === "ollama" && aiConfig.ollamaUrl) {
        formData.append("ollamaUrl", aiConfig.ollamaUrl)
      }

      const isNotebook = uploadedFile.name.endsWith(".ipynb")
      const endpoint = isNotebook ? "/api/translate-notebook" : "/api/translate-archive"

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Translation failed: ${response.status} ${response.statusText}. ${errorText}`)
      }

      // Handle streaming progress updates
      const reader = response.body?.getReader()
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = new TextDecoder().decode(value)
          const lines = chunk.split("\n").filter((line) => line.trim())

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.type === "progress") {
                  setProgress(data.progress)
                } else if (data.type === "log") {
                  setLogs((prev) => [
                    ...prev,
                    {
                      message: data.message,
                      level: data.level,
                      timestamp: new Date(),
                    },
                  ])
                } else if (data.type === "complete") {
                  const endTime = Date.now()
                  const elapsed = ((endTime - startTime) / 1000).toFixed(1)
                  setTranslationTime(`${elapsed}s`) // СОХРАНЯЕМ ВРЕМЯ
                  setTranslatedFilename(data.filename)
                  toast({
                    title: "Translation completed!",
                    description: `File translated successfully in ${elapsed} seconds`,
                  })
                  loadFiles()
                } else if (data.type === "error") {
                  throw new Error(data.message)
                }
              } catch (parseError) {
                console.warn("Could not parse progress data:", line)
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Translation error:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
      setTranslationError(errorMessage)
      setLogs((prev) => [
        ...prev,
        {
          message: `💥 Translation failed: ${errorMessage}`,
          level: "error",
          timestamp: new Date(),
        },
      ])
      toast({
        title: "Translation failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsTranslating(false)
      setProgress(null)
    }
  }

  const downloadTranslatedFile = async () => {
    if (!translatedFilename) return

    try {
      const response = await fetch(`/api/files/translated/${encodeURIComponent(translatedFilename)}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = translatedFilename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast({
          title: "Download started",
          description: `Downloading ${translatedFilename}`,
        })
      }
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Could not download the file",
        variant: "destructive",
      })
    }
  }

  const loadFiles = async () => {
    try {
      const response = await fetch("/api/files")
      if (response.ok) {
        const data = await response.json()
        setOriginalFiles(data.original || [])
        setTranslatedFiles(data.translated || [])
      }
    } catch (error) {
      console.error("Error loading files:", error)
    }
  }

  const downloadFile = async (filename: string, type: "original" | "translated") => {
    try {
      const response = await fetch(`/api/files/${type}/${encodeURIComponent(filename)}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast({
          title: "Download started",
          description: `Downloading ${filename}`,
        })
      }
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Could not download the file",
        variant: "destructive",
      })
    }
  }

  const deleteFile = async (filename: string, type: "original" | "translated") => {
    try {
      const response = await fetch(`/api/files/${type}/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "File deleted",
          description: `${filename} has been removed`,
        })
        loadFiles()
      }
    } catch (error) {
      toast({
        title: "Delete failed",
        description: "Could not delete the file",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    loadFiles()
  }, [])

  // Функция для сопоставления файлов
  const getMatchedFiles = () => {
    const matched: Array<{
      original?: ArchiveFile
      translated?: ArchiveFile
      key: string
    }> = []

    const translatedMap = new Map<string, ArchiveFile>()
    translatedFiles.forEach((file) => {
      const originalName = file.filename.replace(/^[^_]+_/, "")
      translatedMap.set(originalName, file)
    })

    originalFiles.forEach((original) => {
      const translated = translatedMap.get(original.filename)
      matched.push({
        original,
        translated,
        key: original.filename,
      })
      if (translated) {
        translatedMap.delete(original.filename)
      }
    })

    translatedMap.forEach((translated) => {
      matched.push({
        translated,
        key: translated.filename,
      })
    })

    return matched
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header с логотипом */}
      <div className="mb-8">
        <div className="flex items-center space-x-4 mb-4">
          <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
            <Languages className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Archive Translator</h1>
            <p className="text-muted-foreground">Translate OpenEdX course archives and Jupyter notebooks using AI</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="translate" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="translate">Translate Files</TabsTrigger>
          <TabsTrigger value="manage">Manage Files</TabsTrigger>
        </TabsList>

        <TabsContent value="translate" className="space-y-6">
          {/* Success Card с кнопкой скачивания и ТАЙМЕРОМ */}
          {translatedFilename && !isTranslating && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center text-green-800">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Translation Complete!
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-700 mb-2">Your file has been successfully translated:</p>
                    <p className="font-medium text-green-800">{translatedFilename}</p>
                    {translationTime && (
                      <div className="flex items-center mt-2 text-sm text-green-600">
                        <Clock className="h-4 w-4 mr-1" />
                        <span>Completed in {translationTime}</span>
                      </div>
                    )}
                  </div>
                  <Button onClick={downloadTranslatedFile} className="ml-4">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error Card */}
          {translationError && !isTranslating && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="flex items-center text-red-800">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Translation Error
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-red-700">{translationError}</p>
                <p className="text-xs text-red-600 mt-2">
                  This may be due to file permissions or special characters in filenames. Please try with a different
                  archive.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Translation Logs */}
          {(isTranslating || logs.length > 0) && (
            <TranslationLogs logs={logs} isVisible={logsVisible} onToggle={() => setLogsVisible(!logsVisible)} />
          )}

          {/* Translation Progress */}
          {progress && (
            <Card>
              <CardHeader>
                <CardTitle>Translation Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{progress.message}</span>
                    <span>
                      {progress.current}/{progress.total}
                    </span>
                  </div>
                  <Progress value={(progress.current / progress.total) * 100} />
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Configuration */}
            <div className="space-y-6 flex flex-col">
              {/* API Configuration */}
              <APIConfiguration onConfigChange={setAiConfig} />

              {/* Language Selection */}
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle>Translation Settings</CardTitle>
                  <CardDescription>Select target language</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Target Language</Label>
                    <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {languageOptions.map((lang) => (
                          <SelectItem key={lang} value={lang}>
                            {lang}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {targetLanguage === "Other language" && (
                    <div className="space-y-2">
                      <Label htmlFor="custom-language">Enter Language</Label>
                      <Input
                        id="custom-language"
                        placeholder="e.g., German, Italian, etc."
                        value={customLanguage}
                        onChange={(e) => setCustomLanguage(e.target.value)}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - File Upload */}
            <div className="space-y-6 flex flex-col">
              <Card className="flex-1 flex flex-col">
                <CardHeader>
                  <CardTitle>File Upload</CardTitle>
                  <CardDescription>Upload archive or notebook</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center flex-1 flex flex-col justify-center min-h-[200px]">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".tar,.gz,.tar.gz,.ipynb"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground mb-4">Click to upload</p>
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      Choose File
                    </Button>
                    {uploadedFile && (
                      <div className="mt-4 p-3 bg-muted rounded-lg">
                        <div className="flex items-center justify-center space-x-2">
                          {uploadedFile.name.endsWith(".ipynb") ? (
                            <FileText className="h-4 w-4" />
                          ) : (
                            <FileArchive className="h-4 w-4" />
                          )}
                          <span className="text-sm font-medium">{uploadedFile.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-6">
                    <Button
                      onClick={handleTranslation}
                      disabled={
                        !uploadedFile ||
                        isTranslating ||
                        ((aiConfig.provider === "openai" || aiConfig.provider === "gemini") && !aiConfig.apiKey) ||
                        aiConfig.provider === "gemini" // Gemini отключен
                      }
                      className="w-full"
                      size="lg"
                    >
                      {isTranslating ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          Translating...
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-4 w-4" />
                          Translate {uploadedFile?.name.endsWith(".ipynb") ? "Notebook" : "Archive"}
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="manage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>File Management</CardTitle>
              <CardDescription>
                Manage your original and translated files. Translation times are shown for completed files.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getMatchedFiles().length === 0 ? (
                <div className="text-center py-8">
                  <FileArchive className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No files found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {getMatchedFiles().map((pair) => (
                    <div key={pair.key} className="border rounded-lg p-4">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
                        {/* Оригинальный файл */}
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <FileArchive className="h-5 w-5 text-blue-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            {pair.original ? (
                              <>
                                <p className="font-medium truncate" title={pair.original.filename}>
                                  {pair.original.filename}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Original • {pair.original.modTime} • {(pair.original.size / 1024 / 1024).toFixed(2)}{" "}
                                  MB
                                </p>
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">No original file</p>
                            )}
                          </div>
                          <div className="flex space-x-2 flex-shrink-0">
                            {pair.original && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadFile(pair.original!.filename, "original")}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deleteFile(pair.original!.filename, "original")}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Стрелка */}
                        <div className="flex justify-center">
                          <ArrowRight className="h-5 w-5 text-muted-foreground" />
                        </div>

                        {/* Переведенный файл */}
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <FileArchive className="h-5 w-5 text-green-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            {pair.translated ? (
                              <>
                                <p className="font-medium truncate" title={pair.translated.filename}>
                                  {pair.translated.filename}
                                </p>
                                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                                  <span>
                                    Translated • {pair.translated.modTime} •{" "}
                                    {(pair.translated.size / 1024 / 1024).toFixed(2)} MB
                                  </span>
                                  {/* ПОКАЗЫВАЕМ ВРЕМЯ ПЕРЕВОДА если есть */}
                                  {translationTime && pair.translated.filename === translatedFilename && (
                                    <div className="flex items-center text-green-600">
                                      <Clock className="h-3 w-3 mr-1" />
                                      <span className="text-xs">{translationTime}</span>
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">Not translated yet</p>
                            )}
                          </div>
                          <div className="flex space-x-2 flex-shrink-0">
                            {pair.translated && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadFile(pair.translated!.filename, "translated")}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deleteFile(pair.translated!.filename, "translated")}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
