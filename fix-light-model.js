const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/western', { 
  useNewUrlParser: true, 
  useUnifiedTopology: true 
});

// Define Model schema  
const ModelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  displayName: { type: String, required: true },
  file: { type: String, required: true },
  type: { type: String, required: true },
  lights: [{ 
    name: String, 
    meshName: String, 
    defaultState: String, 
    intensity: String 
  }],
  uiWidgets: [mongoose.Schema.Types.Mixed],
}, { timestamps: true, strict: false });

const Model = mongoose.model('Model', ModelSchema);

async function fixLightModel() {
  try {
    console.log('🔍 Looking for light model...');
    const lightModel = await Model.findOne({ name: 'light' });
    
    if (!lightModel) {
      console.log('❌ Light model not found');
      return;
    }
    
    console.log('✅ Found light model:', lightModel.name);
    console.log('Current lights:', lightModel.lights);
    console.log('Current widgets:', lightModel.uiWidgets?.length || 0, 'widgets');
    
    // Add proper lights configuration
    const updatedModel = await Model.findByIdAndUpdate(
      lightModel._id,
      {
        $set: {
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
          ]
        }
      },
      { new: true }
    );
    
    console.log('✅ Updated light model with proper lights configuration:');
    console.log('New lights:', updatedModel.lights);
    console.log('🎉 Light model fixed! Refresh the page to see working light controls!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

fixLightModel();
