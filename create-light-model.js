const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/western');

const ModelSchema = new mongoose.Schema({}, { strict: false });
const Model = mongoose.model('Model', ModelSchema);

async function checkAndCreateLightModel() {
  try {
    console.log('🔍 Checking all models in database...');
    const allModels = await Model.find({});
    console.log('Found models:', allModels.map(m => ({ name: m.name, displayName: m.displayName })));
    
    // Create light model if it doesn't exist
    const newLightModel = new Model({
      name: 'light',
      displayName: 'Light Model',
      file: 'light.glb', // Adjust this to match your actual file
      type: 'refrigerator',
      lights: [
        {
          name: 'Main Light',
          meshName: 'Point', 
          defaultState: 'on',
          intensity: '5'
        },
        {
          name: 'Ambient Light',
          meshName: 'AmbientLight',
          defaultState: 'on', 
          intensity: '2'
        }
      ],
      uiWidgets: [
        {
          type: 'lightWidget',
          title: 'Light Control',
          meshName: 'Point'
        }
      ],
      camera: {
        position: [0, 0, 5],
        target: [0, 0, 0]
      }
    });
    
    const savedModel = await newLightModel.save();
    console.log('✅ Created light model:', savedModel.name);
    console.log('With lights:', savedModel.lights);
    console.log('With widgets:', savedModel.uiWidgets);
    console.log('🎉 Light model created! You can now test the light widgets!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkAndCreateLightModel();
