#!/usr/bin/env python3

import sys
import os
sys.path.append('/mnt/data_pool_b/kaiyasi/ForumKit/backend')

# Simulate the exact monitoring API call to trace the error
print("=== Tracing Monitoring API Error ===")

try:
    # Set up Flask app context
    from flask import Flask
    from flask_jwt_extended import JWTManager, create_access_token

    app = Flask(__name__)
    app.config['JWT_SECRET_KEY'] = 'iJhqBelyumnhSJKRI29qst2bgT7hLQ9g3oXwzQzIuOI='
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = False

    jwt = JWTManager(app)

    # Import monitoring route function
    with app.app_context():
        from utils.db import get_session
        from models.base import User

        # Get Kaiyasi user
        with get_session() as s:
            user = s.query(User).filter_by(username='Kaiyasi').first()
            print(f"✅ Found user: {user.username} (ID: {user.id})")

            # Generate JWT token and set current user
            token = create_access_token(
                identity=str(user.id),
                additional_claims={"role": user.role}
            )

        # Now import the exact monitoring function
        from routes.routes_instagram import get_publishing_monitoring
        from flask_jwt_extended import get_jwt_identity

        # Mock the JWT identity
        import unittest.mock
        with unittest.mock.patch('routes.routes_instagram.get_jwt_identity', return_value=str(user.id)):
            print("\n🔄 Calling get_publishing_monitoring()...")

            try:
                result = get_publishing_monitoring()
                print("✅ Function executed successfully!")
                print(f"📊 Result type: {type(result)}")

                # Try to get the JSON data
                try:
                    if hasattr(result, 'get_json'):
                        data = result.get_json()
                        print(f"📋 Response data keys: {list(data.keys()) if data else 'None'}")
                        if data and data.get('success'):
                            print("✅ API returned success=True")
                        else:
                            print(f"❌ API returned error: {data.get('error') if data else 'No data'}")
                    else:
                        print(f"📋 Direct result: {result}")
                except Exception as json_err:
                    print(f"⚠️  Could not parse JSON: {json_err}")

            except Exception as api_err:
                print(f"❌ Function failed: {api_err}")
                import traceback
                traceback.print_exc()

                # Check if it's specifically a PostStatus.PENDING error
                if "PENDING" in str(api_err):
                    print("\n🔍 Detailed analysis of PENDING error:")

                    # Check current PostStatus
                    from models.social_publishing import PostStatus
                    print(f"   Current PostStatus: {PostStatus}")
                    print(f"   PostStatus attributes: {[attr for attr in dir(PostStatus) if not attr.startswith('_')]}")

                    # Find where PENDING might be referenced
                    error_traceback = traceback.format_exc()
                    print(f"   Full traceback: {error_traceback}")

except Exception as setup_err:
    print(f"❌ Setup failed: {setup_err}")
    import traceback
    traceback.print_exc()