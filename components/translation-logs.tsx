"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, ScrollText, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface LogEntry {
  message: string
  level: "info" | "success" | "warning" | "error"
  timestamp: Date
}

interface TranslationLogsProps {
  logs: LogEntry[]
  isVisible: boolean
  onToggle: () => void
}

export function TranslationLogs({ logs, isVisible, onToggle }: TranslationLogsProps) {
  const [copied, setCopied] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new logs arrive - ТОЛЬКО если логи видимы
  useEffect(() => {
    if (isVisible && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }, [logs, isVisible])

  const copyLogs = async () => {
    const logText = logs.map((log) => `[${log.timestamp.toLocaleTimeString()}] ${log.message}`).join("\n")

    try {
      await navigator.clipboard.writeText(logText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy logs:", error)
    }
  }

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "success":
        return "✅"
      case "error":
        return "❌"
      case "warning":
        return "⚠️"
      default:
        return "ℹ️"
    }
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case "success":
        return "text-green-600"
      case "error":
        return "text-red-600"
      case "warning":
        return "text-yellow-600"
      default:
        return "text-blue-600"
    }
  }

  if (logs.length === 0) return null

  return (
    <Card className="border-slate-200 bg-slate-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center text-sm font-medium text-slate-600">
            <ScrollText className="h-4 w-4 mr-2" />
            Translation Details ({logs.length})
          </CardTitle>
          <div className="flex items-center space-x-2">
            {logs.length > 0 && (
              <Button variant="ghost" size="sm" onClick={copyLogs} className="h-7 px-2 text-xs">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onToggle} className="h-7 px-2">
              {isVisible ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isVisible && (
        <CardContent className="pt-0">
          <div className="bg-white/70 backdrop-blur-sm rounded-lg border border-slate-200/50 p-4 max-h-48 overflow-y-auto font-mono text-xs shadow-inner">
            <div className="space-y-2">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex items-center space-x-3 py-2 px-3 rounded transition-all duration-500",
                    "hover:bg-white/60",
                    index === logs.length - 1 && "animate-in slide-in-from-left-2 duration-300",
                  )}
                >
                  <span className="flex-shrink-0">{getLevelIcon(log.level)}</span>
                  <span className="text-slate-400 flex-shrink-0 text-[10px] min-w-[60px]">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <span className={cn("flex-1 leading-relaxed", getLevelColor(log.level))}>{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
