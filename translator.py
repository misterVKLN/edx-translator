from bs4 import BeautifulSoup
import html
import tiktoken
from dotenv import load_dotenv
import google.generativeai as genai
from openai import OpenAI
import time
import nbformat
import streamlit as st

from progress_bar import ProgressBar

load_dotenv()


def count_tokens(text):
    encoding = tiktoken.encoding_for_model("gpt-3.5-turbo")
    num_tokens = len(encoding.encode(text))
    return num_tokens


def replace_text_and_attributes(content, tags, translation_map):
    soup = BeautifulSoup(content, 'xml')

    for tag in soup.find_all(tags, string=True):
        if tag.string.strip() in translation_map:
            tag.string.replace_with(translation_map[tag.string.strip()])

    for tag in soup.find_all(tags):
        for attr, value in tag.attrs.items():
            if value in translation_map:
                tag[attr] = translation_map[value]
    soup = soup.prettify()
    return str(soup).replace("<?xml version=\"1.0\" encoding=\"utf-8\"?>", "")


def extract_text_and_attributes(content, tags):
    translations = {}
    soup = BeautifulSoup(content, 'xml')

    for tag in soup.find_all(tags, string=True):
        if tag.string.strip():
            translations[tag.string.strip()] = ""

    for tag in soup.find_all(tags):
        for attr, value in tag.attrs.items():
            if attr == "display_name" or attr == "markdown":
                translations[value] = ""
    return translations


class Translator:
    def __init__(self, api_key=None, model="gemini-pro"):
        if model == "gemini-pro":
            genai.configure(api_key=api_key) if api_key else genai.configure(api_key="")
            self.model = model
        else:
            self.client = OpenAI(api_key=api_key) if api_key else OpenAI()
            self.model = model
            self.encoding = tiktoken.encoding_for_model(model)

    def translate_text(self, input_text, file_type, target_language="ukrainian"):
        openai_models = ["gpt-3.5-turbo", "gpt-4", "gpt-4-1106-preview", "gpt-4o"]

        common_rules = f"""
You MUST translate the content strictly into {target_language}, and ONLY {target_language}.
You MUST NOT add any explanations, disclaimers, general knowledge, or other languages.
You MUST preserve the original formatting, structure, and tags (including HTML/XML or markdown).
If you are unsure, return the original content as-is.
"""

        message = {
            "xml":  f"""
{common_rules}

Translate the following XML content. Only translate text nodes and attribute values (like display_name, markdown).
Do NOT modify tag names or structure. Do NOT return empty. Do NOT reformat. Only translate real visible text.

Original XML content:
{input_text}
""",
            "html": f"""
{common_rules}

Translate the following HTML content. Only translate visible text and attribute values (e.g. alt, title, display_name, markdown).
Keep all tags and structure 100% as-is. Do NOT merge blocks. Do NOT skip content. Do NOT add anything.
Return valid HTML with all structure and styles preserved.

Original HTML content:
{input_text}
""",
            "ipynb": f"""
{common_rules}

Translate markdown cells in the following Jupyter notebook into {target_language}.
Keep all structure, formatting, and code blocks. Do NOT skip any cell. Do NOT return empty cells.

Original notebook content:
{input_text}
"""
        }.get(file_type, input_text)

        result_text = None

        if self.model in openai_models:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": message},
                    {"role": "user", "content": f"{input_text}"}
                ]
            )
            result_text = response.choices[0].message.content.strip()
        else:
            try:
                result_text = genai.GenerativeModel(self.model).generate_content(message).text.strip()
            except Exception as e:
                print(f"[GPT ERROR] {e}")
                time.sleep(1)
                result_text = genai.GenerativeModel(self.model).generate_content(message).text.strip()

        if not result_text or len(result_text.strip()) == 0:
            print("[GPT WARNING] Empty translation received. Keeping original.")
            return input_text

        return result_text

    def find_and_translate_xml(self, content, tags_list, target_language='ukrainian'):
        translation_content = extract_text_and_attributes(content, tags_list)
        total_tags = len(translation_content)

        progress_tag_bar = ProgressBar(total_tags)

        if total_tags > 0:
            progress_tag_bar.update(progress_tag_bar.current)

            for key in translation_content:
                try:
                    translated_text = self.translate_text(key, "xml", target_language)
                    translation_content[key] = translated_text
                    progress_tag_bar.current += 1
                    progress_tag_bar.update(progress_tag_bar.current)
                finally:
                    continue

            final_result = replace_text_and_attributes(content, tags_list, translation_content)
            progress_tag_bar.progress_bar.empty()
            return final_result

        return content

    def find_and_translate_html(self, content, tags_list, target_language='ukrainian'):
        soup = BeautifulSoup(content, 'html.parser')
        tags = soup.find_all(tags_list, recursive=False)
        total_tags = len(tags)

        progress_tag_bar = ProgressBar(total_tags)
        if total_tags > 0:
            progress_tag_bar.update(progress_tag_bar.current)

            for tag in tags:
                if count_tokens(str(tag)) > 4097:
                    tag['style'] = 'background: #fffee0;'
                    print(f"Tag too big or there's an error. It was marked.")
                try:
                    if tag.get_text():
                        translated_tag = self.translate_text(str(tag), "html", target_language)
                        tag.replace_with(BeautifulSoup(translated_tag, 'html.parser'))
                except Exception as e:
                    print("Tag doesn't have text in it.", e)
                    pass

                progress_tag_bar.current += 1
                progress_tag_bar.update(progress_tag_bar.current)

        progress_tag_bar.progress_bar.empty()
        return str(soup)


class HTMLTranslator(Translator):
    def __init__(self, api_key=None, model="gpt-3.5-turbo"):
        super().__init__(api_key=api_key, model=model)

    def save_html(self, input_file, output_file, target_language='ukrainian'):
        with open(input_file, 'r', encoding='utf-8') as file:
            html_content = file.read()

        soup = BeautifulSoup(html_content, 'html.parser')

        head_content = soup.head
        body_content = soup.body

        if soup.head:
            soup.head.decompose()
        if soup.body:
            soup.body.decompose()

        translated_remaining_content = self.find_and_translate_html(str(soup),
                                                                    ['html', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                                                                     'ul', 'ol', 'li', 'table', 'strong', 'section',
                                                                     'div', 'dl', 'dd'],
                                                                    target_language)

        if head_content and soup.head:
            soup.head.replace_with(head_content)
        if body_content and soup.body:
            soup.body.replace_with(body_content)

        translated_html_str = ''.join(translated_remaining_content)

        with open(output_file, 'w', encoding='utf-8') as file:
            file.write(html.unescape(translated_html_str))


class XMLTranslator(Translator):
    def __init__(self, api_key=None, model="gpt-3.5-turbo"):
        super().__init__(api_key=api_key, model=model)

    def save_xml(self, input_file, output_file, target_language='ukrainian'):
        with open(input_file, 'r', encoding='utf-8') as file:
            xml_content = file.read()

        translated_content = self.find_and_translate_xml(xml_content,
                                                         ['problem', 'label', 'choice', 'sequential', 'vertical',
                                                          'chapter', 'html', 'course'], target_language)
        with open(output_file, 'w', encoding='utf-8') as file:
            file.write(translated_content)


class IpynbTranslator(Translator):
    def __init__(self, api_key=None, model="gemini-pro"):
        super().__init__(api_key=api_key, model=model)

    def save_ipynb(self, content, progress_bar=None, target_language='ukrainian'):
        progress_text = st.empty()
        nb = nbformat.reads(content, as_version=4)

        markdown_cells = [cell for cell in nb.cells if cell.cell_type == 'markdown']
        total_cells = len(markdown_cells)
        print(f"[INFO] Total markdown cells: {total_cells}")

        for index, cell in enumerate(markdown_cells):
            if cell.cell_type == 'markdown':
                try:
                    translated = self.translate_text(cell.source, "ipynb", target_language)
                    cell.source = translated
                    if progress_bar is not None:
                        progress_text.text(f"Translating cell {index + 1}/{total_cells}")
                        progress = (index + 1) / total_cells
                        progress_bar.progress(progress)
                except Exception as e:
                    print(f"[ERROR] Failed to translate cell {index + 1}: {e}")
                    pass

        return nbformat.writes(nb)
