import streamlit as st
import os
import tarfile
from translator import HTMLTranslator, XMLTranslator
import shutil


def delete_files(folder):
    # Remove existing files in the "Translation" folder if a new file is uploaded
    files_in_translation = os.listdir(folder)
    for file_in_trans in files_in_translation:
        file_path = os.path.join(folder, file_in_trans)
        try:
            if os.path.isfile(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
        except Exception as e:
            print("Error:", e)


def add_files_to_tar(tar_filename, source_dir, owner, group, permissions=0o755):
    with tarfile.open(tar_filename, 'w:gz') as tar:
        for root, dirs, files in os.walk(source_dir):
            for item in dirs + files:
                item_path = os.path.join(root, item)
                relative_path = os.path.relpath(item_path, source_dir)
                tarinfo = tar.gettarinfo(item_path, arcname=relative_path)
                try:
                    tarinfo.uname = owner
                    tarinfo.gname = group
                except:
                    tarinfo.uname = "app"
                    tarinfo.gname = "app"

                if os.path.isdir(item_path):
                    tarinfo.mode = permissions | 0o111  # Set directory permissions
                    tar.addfile(tarinfo)
                else:
                    tarinfo.mode = permissions  # Set file permissions
                    with open(item_path, 'rb') as f:
                        tar.addfile(tarinfo, f)


class ArchiveTranslator:
    def __init__(self, openai_api_key, model):
        self.model = model
        self.html_translator = HTMLTranslator(api_key=openai_api_key, model=self.model)
        self.xml_translator = XMLTranslator(api_key=openai_api_key, model=self.model)

    def process_files(self, output_file, owner, group, progress_html_bar=None, progress_xml_bar=None,
                      target_language='ukrainian'):
        temp_dir = '../temp'

        st.write('Tags translated in current file:')

        # Go through all the folders and files
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                if file.endswith(".html"):
                    full_path = os.path.join(root, file)
                    self.html_translator.save_html(full_path, full_path, target_language)
                    self.html_translator.save_html(full_path, full_path, target_language)

                    progress_html_bar.current += 1
                    progress_html_bar.update(progress_html_bar.current)

                elif file.endswith(".xml"):
                    full_path = os.path.join(root, file)
                    self.xml_translator.save_xml(full_path, full_path, target_language)

                    progress_xml_bar.current += 1
                    progress_xml_bar.update(progress_xml_bar.current)

        add_files_to_tar(output_file, temp_dir, owner, group)

        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
