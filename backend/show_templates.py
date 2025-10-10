import os
import psycopg2
import json
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path='/mnt/data_pool_b/kaiyasi/ForumKit/.env')

# Get the database URL from the environment
database_url = os.getenv("DATABASE_URL")

if not database_url:
    print("DATABASE_URL not found in .env file")
    exit(1)

# Adjust the database URL for host access
database_url = database_url.replace("postgresql+psycopg2://", "postgresql://")
postgres_port = os.getenv("POSTGRES_PORT", "5432")
database_url = database_url.replace("postgres:5432", f"localhost:{postgres_port}")


try:
    # Connect to the database
    conn = psycopg2.connect(database_url)
    cursor = conn.cursor()

    # Check if the content_templates table exists
    cursor.execute("SELECT to_regclass('content_templates')")
    if cursor.fetchone()[0] is None:
        print("Table 'content_templates' does not exist.")
        exit(1)

    # Query the content_templates table
    cursor.execute("SELECT id, name, description, template_type, config, is_active, is_default FROM content_templates")
    templates = cursor.fetchall()

    # Get column names
    columns = [desc[0] for desc in cursor.description]

    print(f"Found {len(templates)} templates:")
    print("-" * 50)

    for template in templates:
        template_dict = dict(zip(columns, template))
        for key, value in template_dict.items():
            if key == 'config' and isinstance(value, str):
                # In older psycopg2 versions, JSON might be returned as a string
                try:
                    value = json.loads(value)
                except json.JSONDecodeError:
                    pass # Keep as string if not valid JSON
            if key == 'config':
                print(f"{key}:")
                print(json.dumps(value, indent=2, ensure_ascii=False))
            else:
                print(f"{key}: {value}")
        print("-" * 50)

    # Close the connection
    cursor.close()
    conn.close()

except Exception as e:
    print(f"An error occurred: {e}")