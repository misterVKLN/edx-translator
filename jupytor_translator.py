import streamlit as st
from translator import IpynbTranslator


class JupyterTranslator:
    def __init__(self, api_key, model):
        self.model = model
        self.translator = IpynbTranslator(api_key=api_key, model=self.model)

    def process_file(self, content, target_language):
        progress_bar = st.progress(0)
        return self.translator.save_ipynb(content, progress_bar, target_language)
