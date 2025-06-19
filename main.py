import streamlit as st
import time
from archive_translator import ArchiveTranslator, delete_files
from jupytor_translator import JupyterTranslator
import os
import tarfile
import glob
from datetime import datetime
from progress_bar import ProgressBar, count_xml_files, count_html_files


def jupyter_preprocess(uploaded_file, api_key, model):
    language_options = ["Ukrainian", "English", "French", "Spanish", "Russian", "Other language"]
    target_language = st.selectbox("Select Target Language", language_options)

    if target_language == "Other language":
        target_language = st.text_input("Enter Other Language:")

    if st.button("Translate Notebook"):
        if api_key:
            content = uploaded_file.getvalue().decode("utf-8")
            file_translator = JupyterTranslator(api_key=api_key, model=model)
            start_time = time.time()
            translated_nb = file_translator.process_file(content, target_language)
            end_time = time.time()
            elapsed_time = end_time - start_time

            st.success(f"File was translated in: {round(elapsed_time, 3)} seconds")

            if translated_nb:
                st.success("Translation successful!")
                bytes_data = translated_nb.encode('utf-8')
                st.download_button(label="Download translated notebook",
                                   data=bytes_data,
                                   file_name="translated_notebook.ipynb",
                                   mime="application/ipynb")
        else:
            st.error("Please enter your OpenAI API Key.")


def archive_postprocess(temp_dir, uploaded_file, model, api_key):
    owner = "app"
    group = "app"

    with tarfile.open(fileobj=uploaded_file, mode='r:gz') as tar:
        members = tar.getmembers()
        if members:
            first_member = members[0]
            owner = first_member.uname
            group = first_member.gname
        tar.extractall(path=temp_dir)

    st.success("Archive uploaded successfully!")

    language_options = ["Ukrainian", "English", "French", "Spanish", "Russian", "Other language"]
    target_language = st.selectbox("Select Target Language", language_options)

    if target_language == "Other language":
        target_language = st.text_input("Enter Other Language:")

    os.makedirs("translated_archives", exist_ok=True)

    base_name = uploaded_file.name
    if not base_name.endswith(".tar.gz"):
        if base_name.endswith("_tar.gz"):
            base_name = base_name.replace("_tar.gz", ".tar.gz")
        elif base_name.endswith("_tar"):
            base_name = base_name.replace("_tar", ".tar")
        elif not base_name.endswith(".tar") and not base_name.endswith(".gz"):
            base_name += ".tar.gz"

    output_archive_file = os.path.join("translated_archives", f"{target_language}_{base_name}")

    total_html = count_html_files(temp_dir)
    total_xml = count_xml_files(temp_dir)

    progress_html_bar = ""
    progress_xml_bar = ""

    if st.button("Translate Archive"):

        if total_html > 0:
            st.write('HTML Progress:')
            progress_html_bar = ProgressBar(total_html)
            progress_html_bar.update(0)
        if total_xml > 0:
            st.write('XML Progress:')
            progress_xml_bar = ProgressBar(total_xml)
            progress_xml_bar.update(0)

        if api_key:
            archive_translator = ArchiveTranslator(openai_api_key=api_key, model=model)
            start_time = time.time()
            archive_translator.process_files(output_archive_file, owner, group,
                                             progress_html_bar, progress_xml_bar, target_language)
            end_time = time.time()
            elapsed_time = end_time - start_time

            st.success(f"Archive was translated in: {round(elapsed_time, 3)} seconds")

            if os.path.exists(output_archive_file):
                with open(output_archive_file, "rb") as file:
                    file_contents = file.read()

                st.download_button(
                    label="Click here to download",
                    data=file_contents,
                    key="download_button",
                    file_name=os.path.basename(output_archive_file)
                )
        else:
            st.error("Please enter your OpenAI/Gemini API Key.")


def list_existing_archives():
    st.markdown("---")
    st.subheader("Manage Existing Translated Archives")

    archive_files = sorted(glob.glob("translated_archives/*.tar.gz"), key=lambda x: os.path.getmtime(x), reverse=True)
    if not archive_files:
        st.info("No translated archives found.")
        return

    for archive in archive_files:
        cols = st.columns([4, 2, 2])
        mod_time = datetime.fromtimestamp(os.path.getmtime(archive)).strftime("%Y-%m-%d %H:%M")
        filename = os.path.basename(archive)
        cols[0].markdown(f"📦 `{mod_time} — {filename}`")

        with open(archive, "rb") as file:
            file_bytes = file.read()
            if cols[1].download_button("Download", data=file_bytes, file_name=filename, mime="application/gzip", key=f"dl_{archive}"):
                st.toast("Preparing and download...")

        if cols[2].button(f"Delete ❌", key=f"delete_{archive}"):
            os.remove(archive)
            st.success(f"Deleted: {filename}")
            try:
                st.experimental_rerun()
            except Exception:
                st.warning("Please refresh the page manually to update the archive list.")
            break


def main():
    st.title("Archive Translator")
    api_key = st.text_input("Enter your OpenAI API Key:", type="password")

    model_label = st.radio(
        "Select Model",
        ["GPT-4o (Mini)"],
        index=0
    )
    model = "gpt-4o"

    uploaded_file = st.file_uploader("Upload an Archive (tar.gz)/Jupyter Notebook (ipynb)", type=["tar", "gz", "ipynb"])

    if uploaded_file:
        temp_dir = "../temp"
        os.makedirs(temp_dir, exist_ok=True)
        delete_files(temp_dir)

        if ".ipynb" not in uploaded_file.name:
            archive_postprocess(temp_dir, uploaded_file, model, api_key)
        else:
            jupyter_preprocess(uploaded_file, api_key, model)

    list_existing_archives()


if __name__ == "__main__":
    main()
