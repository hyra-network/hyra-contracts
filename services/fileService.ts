const fs = require('fs');

const saveContractAddressesToFile = (contractName: any, contractAddresses: any, filePath: any) => {
    // Check if the file already exists
    let existingData = {};
    if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath);
        existingData = JSON.parse(rawData);
    }

    // Merge new contract data with existing data
    const updatedData = {
        ...existingData,
        [contractName]: contractAddresses
    };

    // Write the updated data back to the file
    const dataToWrite = JSON.stringify(updatedData, null, 4);
    fs.writeFileSync(filePath, dataToWrite);

    console.log(`Contract addresses saved to ${filePath}`);

};

const readFile = (filePath: any) => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading file:', error);
        return null;
    }
};


module.exports = {saveContractAddressesToFile, readFile};
