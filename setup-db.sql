-- TRADEGRID Database Setup Script
-- Run this in MySQL (via MySQL Command Line Client or MySQL Workbench)

CREATE DATABASE IF NOT EXISTS tradegrid;

-- Create the dedicated user for TradeGrid
CREATE USER IF NOT EXISTS 'tradegrid_user'@'localhost' IDENTIFIED BY 'tradegrid_secure_password';

-- Grant full privileges on the tradegrid database
GRANT ALL PRIVILEGES ON tradegrid.* TO 'tradegrid_user'@'localhost';

FLUSH PRIVILEGES;

SELECT 'TradeGrid database and user created successfully!' AS Result;
