"""
Test O*NET API (no API key required!)
"""

import requests
import json

def test_onet_occupation(soc_code):
    """
    Get occupation data from O*NET by SOC code.

    Args:
        soc_code: SOC code like "15-1252.00"
    """
    # O*NET Web Services endpoint
    base_url = "https://services.onetcenter.org/ws/online/occupations"

    # Full SOC code format (with .00 suffix)
    if not soc_code.endswith(".00"):
        soc_code = soc_code + ".00"

    url = f"{base_url}/{soc_code}"

    print(f"Testing O*NET API (NO API KEY NEEDED)")
    print(f"URL: {url}")
    print("="*60)

    try:
        # No auth headers needed!
        response = requests.get(url, timeout=10)

        print(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()

            print("✅ SUCCESS! Data retrieved:\n")
            print(f"Title: {data.get('title', 'N/A')}")
            print(f"Code: {data.get('code', 'N/A')}")
            print(f"Description: {data.get('description', 'N/A')[:150]}...")

            return data
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return None

    except Exception as e:
        print(f"❌ Exception: {e}")
        return None


def test_onet_wages(soc_code):
    """
    Get wage data from O*NET.
    """
    if not soc_code.endswith(".00"):
        soc_code = soc_code + ".00"

    # Wage data endpoint
    url = f"https://services.onetcenter.org/ws/online/occupations/{soc_code}/summary/wages"

    print(f"\n{'='*60}")
    print(f"Testing O*NET Wage Data")
    print(f"URL: {url}")
    print("="*60)

    try:
        response = requests.get(url, timeout=10)

        print(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()

            print("✅ Wage data retrieved:\n")

            # O*NET provides wage info
            if 'annual_median' in data:
                print(f"Annual Median Wage: ${data.get('annual_median', 'N/A'):,}")

            if 'percentiles' in data:
                percs = data['percentiles']
                print(f"10th Percentile: ${percs.get('pct10', 'N/A')}")
                print(f"25th Percentile: ${percs.get('pct25', 'N/A')}")
                print(f"50th Percentile: ${percs.get('pct50', 'N/A')}")
                print(f"75th Percentile: ${percs.get('pct75', 'N/A')}")
                print(f"90th Percentile: ${percs.get('pct90', 'N/A')}")

            return data
        else:
            print(f"❌ Status: {response.status_code}")
            print(f"Response: {response.text[:300]}")
            return None

    except Exception as e:
        print(f"❌ Exception: {e}")
        return None


if __name__ == "__main__":
    print("="*60)
    print("O*NET API Test - NO API KEY REQUIRED!")
    print("="*60)

    # Test with Software Developers (15-1252)
    soc_code = "15-1252"

    print(f"\nTesting SOC Code: {soc_code} (Software Developers)\n")

    # Get occupation info
    occ_data = test_onet_occupation(soc_code)

    # Get wage data
    wage_data = test_onet_wages(soc_code)

    print("\n" + "="*60)
    print("Test Complete!")
    print("="*60)
