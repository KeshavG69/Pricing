"""
Simple BLS API test using known-working CPI series IDs.
"""

import requests
import json

API_KEY = "73847c2940aa4d59ac8f5f3e77154520"

print("="*60)
print("Testing BLS API with CPI Data (Known Working Series)")
print("="*60)

# Test with CPI data first (known to work)
headers = {'Content-type': 'application/json'}
data = json.dumps({
    "seriesid": ['CUUR0000SA0', 'SUUR0000SA0'],
    "startyear": "2020",
    "endyear": "2023",
    "registrationkey": API_KEY
})

print("\nTest 1: CPI Data (Consumer Price Index)")
print("Series IDs: CUUR0000SA0, SUUR0000SA0")
print("Making request...")

p = requests.post('https://api.bls.gov/publicAPI/v2/timeseries/data/', data=data, headers=headers)
json_data = json.loads(p.text)

print(f"Status: {json_data.get('status')}")

if json_data.get('status') == 'REQUEST_SUCCEEDED':
    print("✅ API Key is working!")
    print("\nSample data:")
    for series in json_data['Results']['series']:
        seriesId = series['seriesID']
        print(f"\n  Series: {seriesId}")
        for item in series['data'][:3]:  # Show first 3 data points
            print(f"    {item['year']}-{item['period']}: {item['value']}")
else:
    print(f"❌ Error: {json_data.get('message')}")

# Now test OEWS data for occupation (SOC code)
print("\n" + "="*60)
print("Testing OEWS Data (Occupational Employment & Wages)")
print("="*60)

# Try different OEWS formats
oews_series_formats = [
    ("OEUN000000000000151252004", "Format 1: OEUN + national + all industries + SOC 151252 + mean annual"),
    ("OEUM000000000000151252004", "Format 2: OEUM + national + all industries + SOC 151252 + mean annual"),
    ("OEUS000000151252004", "Format 3: OEUS + national + SOC 151252 + mean annual"),
]

for series_id, description in oews_series_formats:
    print(f"\n{description}")
    print(f"Series ID: {series_id}")

    data = json.dumps({
        "seriesid": [series_id],
        "startyear": "2020",
        "endyear": "2023",
        "registrationkey": API_KEY
    })

    p = requests.post('https://api.bls.gov/publicAPI/v2/timeseries/data/', data=data, headers=headers)
    json_data = json.loads(p.text)

    if json_data.get('status') == 'REQUEST_SUCCEEDED':
        series = json_data['Results']['series']
        if series and series[0].get('data'):
            print("✅ SUCCESS! Data found:")
            for item in series[0]['data'][:3]:
                print(f"  {item['year']}: ${item['value']}")
        else:
            print("❌ No data returned")
    else:
        print(f"❌ Failed: {json_data.get('message')}")

print("\n" + "="*60)
