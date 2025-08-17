from datetime import datetime, timezone as dt_timezone
from sqlalchemy import Column, Integer, String, ForeignKey, Enum, DateTime
from sqlalchemy.orm import relationship
from utils.db import Base

class Media(Base):
    __tablename__ = "media"
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=True)
    # comment_id = Column(Integer, ForeignKey("comments.id"), nullable=True)  # 暫時註解，因為 comments 表不存在
    kind = Column(Enum("image","video", name="media_kind"), nullable=False)
    url = Column(String(512), nullable=False)       # /uploads/images/2025/08/uuid.jpg
    thumb_url = Column(String(512), nullable=True)  # /uploads/images/2025/08/uuid.thumb.webp
    mime = Column(String(128), nullable=False)
    status = Column(Enum("pending","approved","rejected", name="review_status"), default="pending")
    created_at = Column(DateTime, default=lambda: datetime.now(dt_timezone.utc))

    post = relationship("Post", back_populates="media", lazy="joined")
