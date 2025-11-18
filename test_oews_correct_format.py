"""
Test OEWS with the correct format found in BLS documentation.
Example from docs: OEUN000000056--5747213213
"""

import requests
import json

API_KEY = "73847c2940aa4d59ac8f5f3e77154520"

# First, let's test the exact example from BLS docs
test_series_id = "OEUN000000056--5747213213"

print("="*70)
print("Testing OEWS Series ID from BLS Documentation")
print("="*70)

print(f"\nSeries ID: {test_series_id}")
print("Making request...")

headers = {'Content-type': 'application/json'}
data = json.dumps({
    "seriesid": [test_series_id],
    "startyear": "2020",
    "endyear": "2023",
    "registrationkey": API_KEY
})

response = requests.post(
    'https://api.bls.gov/publicAPI/v2/timeseries/data/',
    data=data,
    headers=headers,
    timeout=10
)

json_data = json.loads(response.text)

print(f"Status: {json_data.get('status')}")

if json_data.get('status') == 'REQUEST_SUCCEEDED':
    series = json_data['Results']['series']
    if series and series[0].get('data'):
        print("✅ SUCCESS! OEWS data is available through API!")
        print("\nSample data:")
        for item in series[0]['data'][:5]:
            print(f"  {item['year']}-{item.get('period', 'Annual')}: ${item['value']}")

        print("\n🎯 Now we need to figure out the format for other SOC codes")
        print("   Pattern: OEUN + zeros + ??? + -- + ???")
    else:
        print("❌ No data returned")
else:
    print(f"❌ Error: {json_data.get('message')}")

print("\n" + "="*70)
