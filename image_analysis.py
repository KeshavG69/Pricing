import json
import base64
from pathlib import Path
import boto3
from app.settings import settings
import os
import asyncio
from client.unstructuredapp import unstructuredApp
from langchain_core.prompts import ChatPromptTemplate
from client.ultimate_llm import get_llm
from concurrent.futures import ThreadPoolExecutor


class ImageAnalysis:
    def __init__(self):
        pass  # No longer need to initialize PortKeyClient

    def handle_file_upload(self, file_path):
        _, file_extension = os.path.splitext(file_path)

        if file_extension.lower() in [".jpg", ".jpeg", ".png", ".gif", ".webp"]:
            return self.analyze_image(file_path), "Image"
        else:
            return unstructuredApp().document_loader(file_path), "Document"

    def analyze_image(self, file_path):
        client = boto3.client(
            "bedrock-runtime",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name="us-east-1",
        )
        media_types = {
            "jpeg": "image/jpeg",
            "jpg": "image/jpeg",
            "png": "image/png",
            "gif": "image/gif",
            "webp": "image/webp",
        }
        file_extension = Path(file_path).suffix[1:].lower()
        if file_extension not in media_types:
            raise ValueError(f"Unsupported file type: {file_extension}")

        media_type = media_types[file_extension]

        with open(file_path, "rb") as image_file:
            image_data = image_file.read()

        base64_image = base64.b64encode(image_data).decode("utf-8")

        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1001,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": base64_image,
                            },
                        },
                        {
                            "type": "text",
                            "text": "Please describe this image in detail list all the little details and explain in depth,Describe as if you were explaining it to someone who can't see it. Focus on the main elements, colors, and any notable features or patterns. What's the overall mood or atmosphere of the image?",
                        },
                    ],
                }
            ],
        }

        response = client.invoke_model(
            modelId="anthropic.claude-3-sonnet-20240229-v1:0",
            contentType="application/json",
            accept="application/json",
            body=json.dumps(payload),
        )

        result = json.loads(response["body"].read())
        return result["content"][0]["text"]

    def analyze_screentshot(self, file_path):
        client = boto3.client(
            "bedrock-runtime",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name="us-east-1",
        )
        media_types = {
            "jpeg": "image/jpeg",
            "jpg": "image/jpeg",
            "png": "image/png",
            "gif": "image/gif",
            "webp": "image/webp",
        }
        file_extension = Path(file_path).suffix[1:].lower()
        if file_extension not in media_types:
            raise ValueError(f"Unsupported file type: {file_extension}")

        media_type = media_types[file_extension]

        with open(file_path, "rb") as image_file:
            image_data = image_file.read()

        base64_image = base64.b64encode(image_data).decode("utf-8")

        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1001,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": base64_image,
                            },
                        },
                        {
                            "type": "text",
                            "text": "Extract text from the given image only, do not add any explaination or summarization just then extracted text.",
                        },
                    ],
                }
            ],
        }

        response = client.invoke_model(
            modelId="anthropic.claude-3-sonnet-20240229-v1:0",
            contentType="application/json",
            accept="application/json",
            body=json.dumps(payload),
        )

        result = json.loads(response["body"].read())
        return result["content"][0]["text"]

    def analyze_image_with_openrouter(self, file_path):
        """
        Analyze image using OpenRouter API with Gemma model

        Args:
            file_path (str): Path to the image file

        Returns:
            str: Analysis of the image content
        """
        with open(file_path, "rb") as image_file:
            image_data = base64.b64encode(image_file.read()).decode("utf-8")

        llm = get_llm(
            provider="openrouter", model="google/gemini-2.5-flash-lite"
        )

        # Create prompt template
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "Extract ALL information from this image with precise attention to structure and layout. DO NOT include any opening statements, explanations, or closing remarks. START AND END with the extracted content only. For text: maintain paragraph breaks, bullet points, and formatting. For tables: preserve row/column structure using markdown table format. For charts/diagrams: describe visual elements, explain relationships between components, identify trends, and extract all data points and labels. For formulas/equations: reconstruct them accurately. Always maintain the original spatial layout and reading order. Identify headers, footers, page numbers, and other document elements. This is a critical data extraction task - ensure ALL text content is captured exactly as it appears.",
                ),
                (
                    "user",
                    [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_data}"
                            },
                        }
                    ],
                ),
            ]
        )

        chain = prompt | llm

        response = chain.invoke({"image_data": image_data})

        return response.content

    async def analyze_image_with_openrouter_async(self, file_path):
        """
        Asynchronous version of analyze_image_with_openrouter

        Args:
            file_path (str): Path to the image file

        Returns:
            str: Analysis of the image content
        """
        # Encode image to base64
        with open(file_path, "rb") as image_file:
            image_data = base64.b64encode(image_file.read()).decode("utf-8")

        llm = get_llm(
            provider="openrouter", model="google/gemini-2.5-flash-lite"
        )

        # Create prompt template
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "Extract ALL information from this image with precise attention to structure and layout. DO NOT include any opening statements, explanations, or closing remarks. START AND END with the extracted content only. For text: maintain paragraph breaks, bullet points, and formatting. For tables: preserve row/column structure using markdown table format. For charts/diagrams: describe visual elements, explain relationships between components, identify trends, and extract all data points and labels. For formulas/equations: reconstruct them accurately. Always maintain the original spatial layout and reading order. Identify headers, footers, page numbers, and other document elements. This is a critical data extraction task - ensure ALL text content is captured exactly as it appears.",
                ),
                (
                    "user",
                    [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_data}"
                            },
                        }
                    ],
                ),
            ]
        )

        chain = prompt | llm

        # Run in a thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: chain.invoke({"image_data": image_data})
        )

        return response.content

    async def analyze_images_batch(self, file_paths):
        """
        Process multiple images in parallel

        Args:
            file_paths (list): List of image file paths

        Returns:
            list: List of analysis results
        """
        tasks = []
        for file_path in file_paths:
            tasks.append(self.analyze_image_with_openrouter_async(file_path))

        results = await asyncio.gather(*tasks)
        return results

    def generate_image(prompt: str):
        client = boto3.client(
            "bedrock-runtime",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name="us-east-1",
        )

        body = {
            "taskType": "TEXT_IMAGE",
            "textToImageParams": {
                "text": prompt,
            },
            "imageGenerationConfig": {
                "numberOfImages": 1,
                "quality": "premium",
                "height": 512,
                "width": 512,
                "cfgScale": 7.0,
            },
        }

        response = client.invoke_model(
            body=json.dumps(body),
            modelId="amazon.titan-image-generator-v1",
            accept="application/json",
            contentType="application/json",
        )

        response_body = json.loads(response["body"].read())
        image_data = response_body.get("images")[0]
        return image_data  # This is the base64 encoded image
