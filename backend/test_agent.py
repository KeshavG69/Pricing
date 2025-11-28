"""
Test script to debug wage lookup for specific job role.
Usage: python test_agent.py
"""

import asyncio
import json
from agent.agent import create_pricing_agent


async def test_job_role():
    """Test the agent with Senior Systems Administrator role."""

    # The job details
    labor_category = "Senior Systems Administrator (Unix/Linux)"
    description = """
    Minimum of three (3) years of experience in systems administration for Unix/Linux
    environments. Must have experience with shell scripting, system monitoring,
    performance tuning, and security hardening. Knowledge of virtualization technologies
    and cloud platforms is preferred.
    """
    location = "National"  # Should default to National if None

    print("="*80)
    print("🧪 TESTING WAGE LOOKUP AGENT")
    print("="*80)
    print(f"Labor Category: {labor_category}")
    print(f"Description: {description[:100]}...")
    print(f"Location: {location}")
    print("="*80)
    print()

    try:
        # Create agent
        print("📝 Step 1: Creating pricing agent...")
        agent = await create_pricing_agent(
            labor_category=labor_category,
            description=description,
            location=location
        )
        print("✅ Agent created successfully")
        print()

        # Run agent
        print("🔍 Step 2: Running agent to find wage data...")
        prompt = f"Find wage data for {labor_category} in {location}"
        print(f"Prompt: {prompt}")
        print()

        result = await agent.arun(prompt)

        print("="*80)
        print("📊 AGENT RESULT")
        print("="*80)

        if result:
            print(f"Result type: {type(result)}")
            print(f"Has content: {hasattr(result, 'content')}")

            if hasattr(result, 'content'):
                wage_data = result.content
                print(f"Content type: {type(wage_data)}")
                print(f"Content: {wage_data}")
                print()

                # Try to parse if string
                if isinstance(wage_data, str):
                    print("🔄 Parsing string content...")
                    try:
                        parsed = json.loads(wage_data.replace("'", '"'))
                        print("✅ Parsed as JSON:")
                        print(json.dumps(parsed, indent=2))

                        # Check wage data
                        if "wages" in parsed:
                            wages = parsed["wages"]
                            print()
                            print("💰 WAGE PERCENTILES:")
                            for percentile, value in wages.items():
                                print(f"  {percentile}: ${value if value else 'N/A'}")

                    except json.JSONDecodeError as e:
                        print(f"⚠️  JSON parsing failed: {e}")
                        print("Trying eval...")
                        try:
                            parsed = eval(wage_data)
                            print("✅ Parsed with eval:")
                            print(parsed)
                        except Exception as e2:
                            print(f"❌ Eval also failed: {e2}")

                elif isinstance(wage_data, dict):
                    print("✅ Content is already a dict:")
                    print(json.dumps(wage_data, indent=2, default=str))

                    if "wages" in wage_data:
                        wages = wage_data["wages"]
                        print()
                        print("💰 WAGE PERCENTILES:")
                        for percentile, value in wages.items():
                            print(f"  {percentile}: ${value if value else 'N/A'}")
            else:
                print("❌ Result has no 'content' attribute")
                print(f"Result attributes: {dir(result)}")
        else:
            print("❌ Agent returned None or empty result")

        print()
        print("="*80)

    except Exception as e:
        print()
        print("="*80)
        print("❌ ERROR OCCURRED")
        print("="*80)
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        import traceback
        print("\nFull traceback:")
        traceback.print_exc()


if __name__ == "__main__":
    print("\n🚀 Starting test...\n")
    asyncio.run(test_job_role())
    print("\n✅ Test complete\n")
