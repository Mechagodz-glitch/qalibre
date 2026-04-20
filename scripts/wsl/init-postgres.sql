CREATE USER qa_user WITH PASSWORD 'qa_password' CREATEDB;
CREATE DATABASE qa_dataset_db OWNER qa_user;
GRANT ALL PRIVILEGES ON DATABASE qa_dataset_db TO qa_user;
