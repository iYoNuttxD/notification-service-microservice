#!/usr/bin/env node
/**
 * Template Seeding Script
 * 
 * Usage: node scripts/seedTemplates.js
 * 
 * Seeds default notification templates into the database.
 * Can be run standalone or as part of the application startup.
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const MongoTemplateRepository = require('../src/infra/repositories/MongoTemplateRepository');

async function main() {
  let mongoClient;

  try {
    console.log('Connecting to MongoDB...');
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    console.log('Connected to MongoDB');

    const dbName = process.env.MONGODB_DB_NAME || 'notifications_db';
    const templateRepository = new MongoTemplateRepository(mongoClient, dbName);
    await templateRepository.init();

    console.log('Seeding templates...');
    const result = await templateRepository.seedDefaults();

    console.log('Template seeding completed:');
    console.log(`  - Inserted: ${result.inserted}`);
    console.log(`  - Skipped (already exist): ${result.skipped}`);
    console.log(`  - Total: ${result.total}`);

    process.exit(0);
  } catch (error) {
    console.error('Failed to seed templates:', error);
    process.exit(1);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
    }
  }
}

main();
