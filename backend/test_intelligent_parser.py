"""Test script for the intelligent parser."""

import asyncio
import json
from client.intelligent_parser import parse_document_intelligent


async def test_cyberesoc():
    """Test intelligent parser on Performance Work Statement contract."""

    file_path = "/Users/keshav/Downloads/Performance Work Statement C (1).pdf"

    print("Starting intelligent parser test...")
    print(f"File: {file_path}\n")

    try:
        result = await parse_document_intelligent(file_path)

        print("\n" + "="*70)
        print("FINAL RESULT")
        print("="*70)
        print(json.dumps(result, indent=2, default=str))

        return result

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    result = asyncio.run(test_cyberesoc())

    if result:
        print("\n✅ Test completed successfully")
    else:
        print("\n❌ Test failed")
