#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const https = require('https')

async function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  // Parse header
  const header = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1'))

  // Parse rows
  const records = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Simple CSV parsing (handles quoted fields)
    let fields = []
    let current = ''
    let inQuotes = false

    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      const nextChar = line[j + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"'
          j++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    fields.push(current.trim())

    const record = {}
    for (let j = 0; j < header.length; j++) {
      record[header[j]] = fields[j]?.replace(/^"(.*)"$/, '$1') || ''
    }
    records.push(record)
  }

  return records
}

async function importAdvisors(csvPath, apiUrl) {
  try {
    console.log('📖 Parsing CSV...')
    const records = await parseCSV(csvPath)
    console.log(`✅ Parsed ${records.length} advisors`)

    console.log('📤 Uploading to API...')

    const data = JSON.stringify({ records })

    return new Promise((resolve, reject) => {
      const url = new URL(apiUrl)
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      }

      const req = https.request(options, (res) => {
        let body = ''
        res.on('data', chunk => (body += chunk))
        res.on('end', () => {
          try {
            const result = JSON.parse(body)
            console.log('\n📊 Import Results:')
            console.log(`   ✨ Created: ${result.created}`)
            console.log(`   ✅ Updated: ${result.updated}`)
            console.log(`   ❌ Errors: ${result.errors}`)
            console.log(`   📈 Total: ${result.total}`)

            if (result.details && result.details.length > 0) {
              console.log('\n📋 Details:')
              result.details
                .filter(d => d.status !== 'updated' || result.created + result.updated < 20)
                .slice(0, 20)
                .forEach(d => {
                  const icon = d.status === 'created' ? '✨' : d.status === 'updated' ? '✅' : '❌'
                  console.log(`   ${icon} ${d.name} (NMLS ${d.nmls || 'N/A'}): ${d.message}`)
                })
            }

            resolve(result)
          } catch (e) {
            reject(e)
          }
        })
      })

      req.on('error', reject)
      req.write(data)
      req.end()
    })
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

const csvPath = process.argv[2] || './advisors.csv'
const apiUrl = process.argv[3] || 'https://mettle-hub.vercel.app/api/admin/import-advisors'

if (!fs.existsSync(csvPath)) {
  console.error(`❌ CSV file not found: ${csvPath}`)
  process.exit(1)
}

importAdvisors(csvPath, apiUrl)
