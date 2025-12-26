import asyncio
from client.jd_parser import parse_documents_to_dataframe

async def test_travel_extraction():
    document_path = "/Users/keshav/Downloads/SURFLANT Ingestion (2).xlsx"

    print(f"Testing extraction from: {document_path}\n")

    result = await parse_documents_to_dataframe([document_path])

    print("\n" + "="*80)
    print("TRAVEL DATA EXTRACTED:")
    print("="*80)

    travel = result.get("travel", [])
    print(f"Total travel items: {len(travel)}\n")

    for i, item in enumerate(travel):
        print(f"Travel Item {i+1}:")
        print(f"  Description: {item.get('description', 'N/A')}")
        print(f"  Amount per year: {item.get('amount_per_year', {})}")
        print()

    print("\n" + "="*80)
    print("ODC DATA EXTRACTED:")
    print("="*80)

    odcs = result.get("odcs", [])
    print(f"Total ODC items: {len(odcs)}\n")

    for i, item in enumerate(odcs):
        print(f"ODC Item {i+1}:")
        print(f"  Category: {item.get('category', 'N/A')}")
        print(f"  Description: {item.get('description', 'N/A')}")
        print(f"  Amount per year: {item.get('amount_per_year', {})}")
        print()

    print("\n" + "="*80)
    print("METADATA:")
    print("="*80)

    df = result.get("df")
    if df is not None and not df.empty:
        print(f"Total years: {df['total_years'].iloc[0] if 'total_years' in df.columns else 'N/A'}")
        print(f"Base years: {df['base_years'].iloc[0] if 'base_years' in df.columns else 'N/A'}")
        print(f"Option years: {df['option_years'].iloc[0] if 'option_years' in df.columns else 'N/A'}")

    print("\n" + "="*80)
    print("EXTENSIONS:")
    print("="*80)

    extensions = result.get("extensions", [])
    if extensions:
        print(f"Total extensions: {len(extensions)}\n")
        for i, ext in enumerate(extensions):
            print(f"Extension {i+1}:")
            print(f"  Year: {ext.get('year', 'N/A')}")
            print(f"  Label: {ext.get('label', 'N/A')}")
            print(f"  Duration: {ext.get('duration_months', 'N/A')} months")
            print(f"  Description: {ext.get('description', 'N/A')}")
            print()
    else:
        print("No extensions detected")

if __name__ == "__main__":
    asyncio.run(test_travel_extraction())
