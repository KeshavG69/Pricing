"""
Try to find working OEWS series ID format by testing various patterns.
Based on BLS documentation, OEWS uses specific codes.
"""

import requests
import json

API_KEY = "73847c2940aa4d59ac8f5f3e77154520"

def test_series(series_id, description):
    headers = {'Content-type': 'application/json'}
    data = json.dumps({
        "seriesid": [series_id],
        "startyear": "2020",
        "endyear": "2023",
        "registrationkey": API_KEY
    })

    p = requests.post('https://api.bls.gov/publicAPI/v2/timeseries/data/', data=data, headers=headers)
    json_data = json.loads(p.text)

    print(f"\n{description}")
    print(f"Series ID: {series_id}")

    if json_data.get('status') == 'REQUEST_SUCCEEDED':
        series = json_data['Results']['series']
        if series and series[0].get('data'):
            print("✅ SUCCESS!")
            for item in series[0]['data'][:2]:
                print(f"  {item['year']}-{item.get('period', 'Annual')}: ${item['value']}")
            return True
        else:
            print("❌ No data")
    else:
        print(f"❌ Error: {json_data.get('message', 'Unknown')}")

    return False

print("="*70)
print("Searching for correct OEWS Series ID Format")
print("="*70)

# OEWS data is published annually, not monthly
# Format might be: OEUS + [AREATYPE][AREA] + [INDUSTRY] + [OCCUPATION] + [DATATYPE]

# Try with actual known OEWS patterns from BLS examples
test_patterns = [
    # Pattern 1: National, all industries, all occupations, mean hourly
    ("OEUM004914000000000003", "National all occupations mean hourly (example from BLS)"),

    # Pattern 2: Try Software Developers with state code
    ("OEUS000000000000151252003", "Software Dev - National - Mean Hourly"),
    ("OEUS000000000000151252004", "Software Dev - National - Mean Annual"),

    # Pattern 3: Different area code format
    ("OEUSN0000015125204", "Software Dev - National (short) - Mean Annual"),

    # Pattern 4: All workers national as baseline test
    ("OEUM00491400000000000004", "All occupations - Mean Annual"),

    # Pattern 5: Metro area format (if national doesn't work)
    ("OEUM004914151252004", "Metro area format"),
]

for series_id, desc in test_patterns:
    if test_series(series_id, desc):
        print("\n🎉 Found a working format!")
        break

print("\n" + "="*70)
print("If none worked, OEWS might not be available via standard API")
print("May need to use BLS database download instead")
print("="*70)
