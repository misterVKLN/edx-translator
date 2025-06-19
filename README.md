# Archive Translator

Полнофункциональное приложение для перевода архивов курсов OpenEdX и Jupyter notebooks.

## Features

- **Archive Translation**: Translate tar.gz archives containing XML and HTML files
- **Notebook Translation**: Translate Jupyter notebook (.ipynb) files
- **Progress Tracking**: Real-time progress updates during translation
- **Multiple Languages**: Support for Ukrainian, English, French, Spanish, Russian, and custom languages
- **AI Models**: Integration with OpenAI GPT models
- **File Management**: Download and manage translated archives
- **Modern UI**: Clean, responsive interface built with Next.js and Tailwind CSS

## Установка и запуск

1. **Установите зависимости:**
```bash
npm install
```

2. **Запустите приложение:**
```bash
npm run dev
```

3. **Откройте браузер:**
http://localhost:3000

4. **Введите API ключ:**
Вставьте ваш OpenAI API ключ в интерфейсе приложения

## Структура папок

После первого запуска создастся структура:
```
uploads/
├── original/     # Оригинальные файлы
└── translated/   # Переведенные файлы
```

## Использование

1. **Загрузите файл** - выберите .tar.gz архив или .ipynb notebook
2. **Введите API ключ** - ваш OpenAI API ключ в интерфейсе
3. **Выберите язык** - целевой язык перевода
4. **Нажмите "Translate"** - начнется процесс перевода
5. **Управляйте файлами** - во вкладке "Manage Files"

## Поддерживаемые форматы

- **.tar.gz** - архивы курсов OpenEdX
- **.tar** - обычные tar архивы
- **.ipynb** - Jupyter notebooks

## Функции

- ✅ Реальный перевод через OpenAI API
- ✅ Прогресс бар с детальной информацией
- ✅ Сохранение оригиналов и переводов
- ✅ Скачивание и удаление файлов
- ✅ Поддержка XML, HTML, Markdown
- ✅ Жесткие промты для качественного перевода
- ✅ API ключ вводится через интерфейс (не нужен .env файл)

## API Endpoints

```bash
# Перевод архива
POST /api/translate-archive

# Перевод Jupyter notebook
POST /api/translate-notebook

# Получить список файлов
GET /api/files

# Скачать конкретный файл
GET /api/files/[type]/[filename]

# Удалить конкретный файл
DELETE /api/files/[type]/[filename]
```

## Translation Process

### Archives
1. Extract tar.gz file to temporary directory
2. Identify XML and HTML files
3. Translate content while preserving structure
4. Create new tar.gz with translated content
5. Clean up temporary files

### Notebooks
1. Parse JSON structure
2. Identify markdown cells
3. Translate markdown content
4. Preserve code cells and metadata
5. Return updated JSON

## Supported File Types

- **Archives**: .tar.gz, .tar
- **Notebooks**: .ipynb
- **Content**: XML, HTML, Markdown

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.
