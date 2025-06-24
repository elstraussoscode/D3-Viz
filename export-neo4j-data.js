const neo4j = require('neo4j-driver');
const fs = require('fs').promises;
require('dotenv').config();

// Neo4j connection configuration
const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

async function exportGraphData() {
    const session = driver.session();
    
    try {
        console.log('🔗 Connecting to Neo4j database...');
        
        // Test connection
        await session.run('RETURN 1');
        console.log('✅ Connected successfully!');
        
        // Export nodes with their properties and labels
        console.log('📊 Exporting nodes...');
        const nodeResult = await session.run(`
            MATCH (n)
            RETURN 
                id(n) as nodeId,
                labels(n) as labels,
                properties(n) as properties
            LIMIT 1000
        `);
        
        const nodes = nodeResult.records.map(record => {
            const nodeId = record.get('nodeId').toString();
            const labels = record.get('labels');
            const properties = record.get('properties');
            
            // Use the first label as the type, or 'Unknown' if no labels
            const type = labels.length > 0 ? labels[0] : 'Unknown';
            
            // Create a readable label from properties or use the type
            let label = type;
            if (properties.name) label = properties.name;
            else if (properties.title) label = properties.title;
            else if (properties.label) label = properties.label;
            else if (properties.id) label = properties.id.toString();
            
            return {
                id: `node_${nodeId}`,
                label: label,
                type: type,
                properties: properties,
                neo4jId: nodeId
            };
        });
        
        console.log(`✅ Exported ${nodes.length} nodes`);
        
        // Export relationships
        console.log('🔗 Exporting relationships...');
        const relationshipResult = await session.run(`
            MATCH (n)-[r]->(m)
            RETURN 
                id(startNode(r)) as sourceId,
                id(endNode(r)) as targetId,
                type(r) as relationshipType,
                properties(r) as properties
            LIMIT 5000
        `);
        
        const links = relationshipResult.records.map(record => {
            return {
                source: `node_${record.get('sourceId').toString()}`,
                target: `node_${record.get('targetId').toString()}`,
                type: record.get('relationshipType'),
                properties: record.get('properties')
            };
        });
        
        console.log(`✅ Exported ${links.length} relationships`);
        
        // Create the data structure for D3
        const graphData = {
            nodes: nodes,
            links: links,
            metadata: {
                exportDate: new Date().toISOString(),
                totalNodes: nodes.length,
                totalLinks: links.length,
                nodeTypes: [...new Set(nodes.map(n => n.type))],
                relationshipTypes: [...new Set(links.map(l => l.type))]
            }
        };
        
        // Create data directory if it doesn't exist
        try {
            await fs.mkdir('data', { recursive: true });
        } catch (error) {
            // Directory already exists
        }
        
        // Write to JSON file
        await fs.writeFile('data/graph-data.json', JSON.stringify(graphData, null, 2));
        console.log('💾 Data exported to data/graph-data.json');
        
        // Also create a minified version for production
        await fs.writeFile('data/graph-data.min.json', JSON.stringify(graphData));
        console.log('💾 Minified data exported to data/graph-data.min.json');
        
        // Generate summary statistics
        const nodeTypeCount = {};
        const relationshipTypeCount = {};
        
        nodes.forEach(node => {
            nodeTypeCount[node.type] = (nodeTypeCount[node.type] || 0) + 1;
        });
        
        links.forEach(link => {
            relationshipTypeCount[link.type] = (relationshipTypeCount[link.type] || 0) + 1;
        });
        
        console.log('\n📈 Export Summary:');
        console.log(`Total Nodes: ${nodes.length}`);
        console.log(`Total Relationships: ${links.length}`);
        console.log('\nNode Types:');
        Object.entries(nodeTypeCount).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });
        console.log('\nRelationship Types:');
        Object.entries(relationshipTypeCount).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });
        
    } catch (error) {
        console.error('❌ Error exporting data:', error);
        throw error;
    } finally {
        await session.close();
    }
}

// Advanced export with custom queries
async function exportWithCustomQueries() {
    const session = driver.session();
    
    try {
        console.log('\n🎯 Running custom export queries...');
        
        // You can customize these queries based on your specific data model
        const customQueries = [
            {
                name: 'high_degree_nodes',
                query: `
                    MATCH (n)
                    WITH n, size((n)--()) as degree
                    WHERE degree > 5
                    RETURN 
                        id(n) as nodeId,
                        labels(n) as labels,
                        properties(n) as properties,
                        degree
                    ORDER BY degree DESC
                    LIMIT 50
                `,
                description: 'Nodes with high connectivity (>5 connections)'
            },
            {
                name: 'central_paths',
                query: `
                    MATCH path = (a)-[*2..3]-(b)
                    WHERE id(a) < id(b)
                    WITH path, length(path) as pathLength
                    RETURN 
                        [node in nodes(path) | {id: id(node), labels: labels(node)}] as nodes,
                        [rel in relationships(path) | type(rel)] as relationships,
                        pathLength
                    ORDER BY pathLength
                    LIMIT 100
                `,
                description: 'Important paths of length 2-3'
            }
        ];
        
        const customResults = {};
        
        for (const customQuery of customQueries) {
            console.log(`  Running: ${customQuery.name}`);
            const result = await session.run(customQuery.query);
            customResults[customQuery.name] = {
                description: customQuery.description,
                data: result.records.map(record => record.toObject())
            };
        }
        
        // Save custom results
        await fs.writeFile('data/custom-analysis.json', JSON.stringify(customResults, null, 2));
        console.log('💾 Custom analysis saved to data/custom-analysis.json');
        
    } catch (error) {
        console.error('❌ Error in custom export:', error);
    } finally {
        await session.close();
    }
}

// Main execution
async function main() {
    try {
        await exportGraphData();
        await exportWithCustomQueries();
        console.log('\n🎉 Export completed successfully!');
        console.log('\n📋 Next steps:');
        console.log('1. Commit the data/ directory to your GitHub repository');
        console.log('2. Enable GitHub Pages for your repository');
        console.log('3. Your visualization will be available at: https://yourusername.github.io/your-repo-name/');
        
    } catch (error) {
        console.error('💥 Export failed:', error);
        process.exit(1);
    } finally {
        await driver.close();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await driver.close();
    process.exit(0);
});

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    exportGraphData,
    exportWithCustomQueries
}; 