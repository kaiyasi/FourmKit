import os, pytest
from app import create_app
from utils.db import Base, engine, SessionLocal
from models import User
from werkzeug.security import generate_password_hash
from flask_jwt_extended import create_access_token

@pytest.fixture(scope="session", autouse=True)
def _test_db():
    # 使用同一實例，測前先清空
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture()
def app():
    os.environ["JWT_SECRET_KEY"] = "test"
    a = create_app()
    return a

@pytest.fixture()
def client(app):
    return app.test_client()

@pytest.fixture()
def session():
    s = SessionLocal()
    yield s
    s.rollback(); s.close()

@pytest.fixture()
def admin_token(app, session):
    u = User(username="admin", password_hash=generate_password_hash("x"), role="admin")
    session.add(u); session.commit()
    with app.app_context():
        return create_access_token(identity=u.id, additional_claims={"role": "admin"})

@pytest.fixture()
def user_token(app, session):
    u = User(username="user1", password_hash=generate_password_hash("x"), role="user")
    session.add(u); session.commit()
    with app.app_context():
        return create_access_token(identity=u.id, additional_claims={"role": "user"})
