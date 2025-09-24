FROM python:3.11-alpine

# 安裝必要套件
RUN apk add --no-cache gcc musl-dev

# 設定工作目錄
WORKDIR /app

# 複製應用程式
COPY app.py /app/

# 建立數據目錄
RUN mkdir -p /data

# 暴露端口
EXPOSE 8080

# 啟動服務
CMD ["python", "app.py"]

