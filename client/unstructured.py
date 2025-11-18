"""Document extraction using unstructured library."""

from collections import defaultdict
from unstructured.partition.auto import partition


def extract_document_by_page(file_path: str) -> dict[int, str]:
    """
    Extract text from any document (PDF, DOCX, Excel) grouped by page number.

    Args:
        file_path: Path to the document file

    Returns:
        Dictionary mapping page number to extracted text
    """
    elements = partition(filename=file_path)

    pages = defaultdict(list)
    for element in elements:
        page_num = element.metadata.page_number if hasattr(element.metadata, 'page_number') else 1
        pages[page_num].append(str(element))

    return {page_num: "\n".join(elements) for page_num, elements in pages.items()}
