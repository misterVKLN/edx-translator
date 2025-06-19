import fnmatch
import os
import streamlit as st


def count_xml_files(directory):
    total_html_files = 0

    for root, dirs, files in os.walk(directory):
        for file in files:
            if fnmatch.fnmatch(file, '*.xml'):
                total_html_files += 1

    return total_html_files


def count_html_files(directory):
    total_html_files = 0

    for root, dirs, files in os.walk(directory):
        for file in files:
            if fnmatch.fnmatch(file, '*.html'):
                total_html_files += 1

    return total_html_files


class ProgressBar:
    def __init__(self, total):
        self.progress_bar = st.empty()
        self.total = total
        self.current = 0

    def update(self, current):
        self.current = current
        percentage = int((self.current / self.total) * 100)
        bar_text = f"{self.current}/{self.total} ({percentage}%)"
        self.progress_bar.progress(self.current / self.total, text=bar_text)
