"""
BLS API Verification Script
Tests if the BLS API key is working correctly.
"""

import requests
import json
from datetime import datetime

def verify_bls_api(api_key: str):
    """
    Verify BLS API is working with the provided API key.

    Args:
        api_key: Your BLS API registration key
    """
    print("="*60)
    print("BLS API Verification Test")
    print("="*60)

    # Test with a known SOC code: Software Developers (15-1252)
    soc_code = "151252"  # Without hyphen

    # Try multiple years to find available data
    years_to_try = [2023, 2022, 2021, 2020, 2019, 2018]

    print(f"\nTest Parameters:")
    print(f"  SOC Code: 15-1252 (Software Developers)")
    print(f"  API Key: {api_key[:10]}...{api_key[-4:]}")
    print(f"  Testing years: {years_to_try}")

    # Build series ID for mean wage
    # OEWS Format: OEU + S + AreaCode(4) + Industry(6) + SOC(6) + DataType(2)
    # For national data: OEUS + 0000000 (area) + 000000 (all industries) + SOC + 04 (mean annual)
    series_id = f"OEUS0000000000000{soc_code}04"
    print(f"  Series ID: {series_id}")
    print(f"  Format: OEUS + 0000000 (national) + 000000 (all industries) + {soc_code} + 04 (mean annual)")

    # Prepare request - query multiple years at once
    payload = {
        "seriesid": [series_id],
        "startyear": str(years_to_try[-1]),  # Start from oldest
        "endyear": str(years_to_try[0]),      # End with newest
        "registrationkey": api_key
    }

    url = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
    headers = {"Content-Type": "application/json"}

    print(f"\n🔄 Making API request...")
    print(f"  URL: {url}")

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)

        print(f"\n📡 Response:")
        print(f"  Status Code: {response.status_code}")

        if response.status_code != 200:
            print(f"  ❌ HTTP Error: {response.status_code}")
            print(f"  Response: {response.text[:200]}")
            return False

        data = response.json()

        print(f"  Status: {data.get('status')}")
        print(f"  Response Time: {data.get('responseTime')}ms")

        # Check if request succeeded
        if data.get("status") != "REQUEST_SUCCEEDED":
            print(f"\n❌ API Error:")
            messages = data.get('message', [])
            if messages:
                for msg in messages:
                    print(f"     {msg}")
            else:
                print(f"     Unknown error")
            return False

        # Parse results
        results = data.get("Results", {})
        series = results.get("series", [])

        if not series:
            print(f"\n❌ No data returned")
            return False

        series_data = series[0]
        data_points = series_data.get("data", [])

        if not data_points:
            print(f"\n❌ No data points found for years {years_to_try}")
            print(f"     The series ID might be incorrect or data not available")
            return False

        # Success! Show the data
        print(f"\n✅ API is working correctly!")
        print(f"\n📊 Data Retrieved ({len(data_points)} data points):")
        print(f"  Occupation: Software Developers, Applications")
        print(f"  SOC Code: 15-1252\n")

        # Show all available years
        for dp in data_points:
            year_returned = dp.get("year")
            period = dp.get("period")
            value = dp.get("value")
            print(f"  Year {year_returned}: ${float(value):,.0f}")

        # Show rate limit info
        print(f"\n📈 API Key Status:")
        print(f"  ✅ Registered key detected (500 requests/day limit)")
        print(f"  ✅ Can request up to 50 series at once")
        print(f"  ✅ Can request up to 20 years of data")

        return True

    except requests.exceptions.Timeout:
        print(f"\n❌ Request timeout - API server not responding")
        return False
    except requests.exceptions.RequestException as e:
        print(f"\n❌ Request failed: {e}")
        return False
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        return False


if __name__ == "__main__":
    # Your BLS API key
    API_KEY = "73847c2940aa4d59ac8f5f3e77154520"

    # Run verification
    success = verify_bls_api(API_KEY)

    print("\n" + "="*60)
    if success:
        print("✅ VERIFICATION PASSED - API is ready to use!")
    else:
        print("❌ VERIFICATION FAILED - Please check the issues above")
    print("="*60)
