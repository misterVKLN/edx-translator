"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  CheckCircle,
  XCircle,
  Loader2,
  Brain,
  Sparkles,
  Server,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

interface APIConfigurationProps {
  onConfigChange: (config: {
    provider: "openai" | "gemini" | "ollama"
    apiKey?: string
    model: string
    ollamaUrl?: string
  }) => void
}

export function APIConfiguration({ onConfigChange }: APIConfigurationProps) {
  const [provider, setProvider] = useState<"openai" | "gemini" | "ollama">("openai")
  const [openaiKey, setOpenaiKey] = useState("")
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini")
  const [geminiKey, setGeminiKey] = useState("")
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-pro")
  const [ollamaUrl, setOllamaUrl] = useState("http://127.0.0.1:11434")
  const [ollamaModel, setOllamaModel] = useState("llama3")
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "connected" | "disconnected" | "idle">("idle")
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [showOllamaGuide, setShowOllamaGuide] = useState(false)

  // Модели OpenAI с описаниями
  const openaiModels = [
    {
      id: "gpt-4o-mini",
      name: "GPT-4o Mini",
      enabled: true,
      description: "🟢 Recommended. Fast, cheap and smart. Ideal for translations.",
      pricing: "Input $0.00015, Output $0.00060",
    },
    {
      id: "gpt-4o",
      name: "GPT-4o",
      enabled: false,
      description: "🧠 Most powerful. Excellent for complex texts and languages.",
      pricing: "Input $0.00250, Output $0.01000",
    },
    {
      id: "gpt-4.1-mini",
      name: "GPT-4.1 Mini",
      enabled: false,
      description: "⚡ Faster and slightly smarter. Good if you want more accurate translation.",
      pricing: "Input $0.00040, Output $0.00160",
    },
    {
      id: "gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      enabled: false,
      description: "💸 Very cheap. Suitable for simple texts and saving money.",
      pricing: "Input $0.00050, Output $0.00150",
    },
  ]

  // Модели Gemini с описаниями
  const geminiModels = [
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      enabled: false,
      description: "High quality translation model with excellent accuracy.",
      pricing: "Input $1.25–$2.50, Output $10–$15",
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      enabled: false,
      description: "Fast multimodal model with good performance.",
      pricing: "Input $0.30, Output $2.50",
    },
    {
      id: "gemini-2.5-flash-lite",
      name: "Gemini 2.5 Flash‑Lite",
      enabled: false,
      description: "Super cheap preview model for basic translations.",
      pricing: "Input ~$0.019, Output ~$0.019",
    },
  ]

  // Проверка подключения к Ollama
  const checkOllamaConnection = async () => {
    setOllamaStatus("checking")
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`)
      if (response.ok) {
        const data = await response.json()
        const models = data.models?.map((model: any) => model.name) || []
        setAvailableModels(models)
        setOllamaStatus("connected")
        if (models.length > 0 && !models.includes(ollamaModel)) {
          setOllamaModel(models[0])
        }
      } else {
        setOllamaStatus("disconnected")
        setAvailableModels([])
      }
    } catch (error) {
      setOllamaStatus("disconnected")
      setAvailableModels([])
    }
  }

  // Отправка конфигурации родительскому компоненту
  useEffect(() => {
    if (provider === "openai") {
      onConfigChange({
        provider: "openai",
        apiKey: openaiKey,
        model: openaiModel,
      })
    } else if (provider === "gemini") {
      onConfigChange({
        provider: "gemini",
        apiKey: geminiKey,
        model: geminiModel,
      })
    } else {
      onConfigChange({
        provider: "ollama",
        model: ollamaModel,
        ollamaUrl: ollamaUrl,
      })
    }
  }, [provider, openaiKey, openaiModel, geminiKey, geminiModel, ollamaUrl, ollamaModel, onConfigChange])

  const getStatusIcon = () => {
    switch (ollamaStatus) {
      case "checking":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case "connected":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "disconnected":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return null
    }
  }

  const getStatusText = () => {
    switch (ollamaStatus) {
      case "checking":
        return "Checking connection..."
      case "connected":
        return `Connected (${availableModels.length} models)`
      case "disconnected":
        return "Connection failed"
      default:
        return "Not checked"
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Provider Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={provider} onValueChange={(value) => setProvider(value as "openai" | "gemini" | "ollama")}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="openai" className="flex items-center space-x-2">
              <Brain className="h-4 w-4" />
              <span>OpenAI</span>
            </TabsTrigger>
            <TabsTrigger value="gemini" className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4" />
              <span>Gemini</span>
            </TabsTrigger>
            <TabsTrigger value="ollama" className="flex items-center space-x-2">
              <Server className="h-4 w-4" />
              <span>Local Ollama</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="openai" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="openai-key">OpenAI API Key</Label>
              <Input
                id="openai-key"
                type="password"
                placeholder="sk-..."
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Model Selection</Label>
              <RadioGroup value={openaiModel} onValueChange={setOpenaiModel}>
                {openaiModels.map((model) => (
                  <div key={model.id} className={`flex items-center space-x-2 ${!model.enabled ? "opacity-50" : ""}`}>
                    <RadioGroupItem value={model.id} id={model.id} disabled={!model.enabled} />
                    <Label
                      htmlFor={model.id}
                      className={`flex-1 ${!model.enabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      {model.name} {!model.enabled && "(Coming Soon)"}
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80" side="right">
                        <div className="space-y-2">
                          <h4 className="font-medium">{model.name}</h4>
                          <p className="text-sm text-muted-foreground">{model.description}</p>
                          <div className="text-xs text-muted-foreground">
                            <strong>Pricing:</strong> {model.pricing}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </TabsContent>

          <TabsContent value="gemini" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gemini-key">Gemini API Key</Label>
              <Input
                id="gemini-key"
                type="password"
                placeholder="AI..."
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Model Selection</Label>
              <RadioGroup value={geminiModel} onValueChange={setGeminiModel}>
                {geminiModels.map((model) => (
                  <div key={model.id} className={`flex items-center space-x-2 ${!model.enabled ? "opacity-50" : ""}`}>
                    <RadioGroupItem value={model.id} id={model.id} disabled={!model.enabled} />
                    <Label
                      htmlFor={model.id}
                      className={`flex-1 ${!model.enabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      {model.name} {!model.enabled && "(Coming Soon)"}
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80" side="right">
                        <div className="space-y-2">
                          <h4 className="font-medium">{model.name}</h4>
                          <p className="text-sm text-muted-foreground">{model.description}</p>
                          <div className="text-xs text-muted-foreground">
                            <strong>Pricing:</strong> {model.pricing}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </TabsContent>

          <TabsContent value="ollama" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ollama-url">Ollama Server URL</Label>
              <div className="flex space-x-2">
                <Input
                  id="ollama-url"
                  placeholder="http://127.0.0.1:11434"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                />
                <Button variant="outline" onClick={checkOllamaConnection} disabled={ollamaStatus === "checking"}>
                  Test
                </Button>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                {getStatusIcon()}
                <span className={ollamaStatus === "connected" ? "text-green-600" : "text-red-600"}>
                  {getStatusText()}
                </span>
              </div>
            </div>

            {/* СВОРАЧИВАЕМАЯ ИНСТРУКЦИЯ ДЛЯ OLLAMA */}
            <div className="border border-blue-200 rounded-lg">
              <Button
                variant="ghost"
                onClick={() => setShowOllamaGuide(!showOllamaGuide)}
                className="w-full justify-between p-4 h-auto text-left"
              >
                <div>
                  <h3 className="font-medium text-blue-900">Setup Guide: Using Local Ollama Models</h3>
                  <p className="text-sm text-blue-700 mt-1">Run AI models locally for free, private translations</p>
                </div>
                {showOllamaGuide ? (
                  <ChevronUp className="h-4 w-4 text-blue-600" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-blue-600" />
                )}
              </Button>

              {showOllamaGuide && (
                <div className="p-4 pt-0 space-y-4">
                  <div className="space-y-4">
                    {/* УСТАНОВКА */}
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2">1. Install Ollama</h4>
                      <p className="text-xs text-blue-700 mb-2">
                        Download from: <code className="bg-blue-100 px-1 rounded">ollama.ai</code>
                      </p>
                      <div className="text-xs text-blue-600 space-y-1">
                        <div>Windows/Mac: Download installer</div>
                        <div>
                          Linux:{" "}
                          <code className="bg-blue-100 px-1 rounded">curl -fsSL https://ollama.ai/install.sh | sh</code>
                        </div>
                      </div>
                    </div>

                    {/* РЕКОМЕНДУЕМЫЕ МОДЕЛИ */}
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2">2. Best Models for Translation</h4>
                      <div className="grid grid-cols-1 gap-2 text-xs">
                        <div className="flex justify-between items-center py-1">
                          <code className="bg-green-100 text-green-800 px-2 py-1 rounded font-mono">llama3.1:8b</code>
                          <span className="text-blue-600">Best quality/speed balance</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                          <code className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">qwen2.5:7b</code>
                          <span className="text-blue-600">Excellent for multilingual</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                          <code className="bg-purple-100 text-purple-800 px-2 py-1 rounded font-mono">mistral:7b</code>
                          <span className="text-blue-600">Fast and reliable</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                          <code className="bg-orange-100 text-orange-800 px-2 py-1 rounded font-mono">llama3.2:3b</code>
                          <span className="text-blue-600">Fastest (lower quality)</span>
                        </div>
                      </div>
                    </div>

                    {/* КОМАНДЫ */}
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2">3. Quick Commands</h4>
                      <div className="space-y-2 text-xs">
                        <div>
                          <span className="text-blue-700 font-medium">Download model:</span>
                          <div className="bg-gray-100 p-2 rounded mt-1 font-mono">ollama pull llama3.1:8b</div>
                        </div>
                        <div>
                          <span className="text-blue-700 font-medium">List installed models:</span>
                          <div className="bg-gray-100 p-2 rounded mt-1 font-mono">ollama list</div>
                        </div>
                        <div>
                          <span className="text-blue-700 font-medium">Start Ollama server:</span>
                          <div className="bg-gray-100 p-2 rounded mt-1 font-mono">ollama serve</div>
                        </div>
                      </div>
                    </div>

                    {/* ПРЕИМУЩЕСТВА */}
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2">Why Use Local Models?</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
                        <div>Complete privacy</div>
                        <div>No API costs</div>
                        <div>No rate limits</div>
                        <div>Works offline</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {ollamaStatus === "connected" && availableModels.length > 0 && (
              <div className="space-y-2">
                <Label>Available Models</Label>
                <Select value={ollamaModel} onValueChange={setOllamaModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* РЕКОМЕНДАЦИИ ПО МОДЕЛЯМ */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800 font-medium mb-2">Recommended models for translation:</p>
                  <ul className="text-xs text-blue-700 space-y-1">
                    <li>
                      <code>llama3.1:8b</code> - Best balance of quality and speed
                    </li>
                    <li>
                      <code>qwen2.5:7b</code> - Excellent for multilingual tasks
                    </li>
                    <li>
                      <code>mistral:7b</code> - Good alternative option
                    </li>
                    <li>
                      <code>llama3.2:3b</code> - Faster but lower quality
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {ollamaStatus === "connected" && availableModels.length === 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  No models found. Install a recommended model:
                  <br />
                  <code className="bg-yellow-100 px-1 rounded">ollama pull llama3.1:8b</code>
                </p>
              </div>
            )}

            {ollamaStatus === "disconnected" && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">
                  Cannot connect to Ollama. Make sure it's running:
                  <br />
                  <code className="bg-red-100 px-1 rounded">ollama serve</code>
                </p>
              </div>
            )}

            {/* СТАТУС ТОЛЬКО ДЛЯ OLLAMA */}
            {provider === "ollama" && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">Current: OLLAMA</Badge>
                  <Badge variant={ollamaStatus === "connected" ? "default" : "destructive"}>
                    {ollamaStatus === "connected" ? "Connected" : "Disconnected"}
                  </Badge>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
