import express from 'express';
import { CustomModelService } from '../services/customModelService.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * GET /api/v1/custom-models
 * List all custom models
 */
router.get('/', protect, async (req, res) => {
  try {
    const models = await CustomModelService.getAllCustomModels();
    res.json({
      success: true,
      data: models
    });
  } catch (error) {
    console.error('Error fetching custom models:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/custom-models/:id
 * Get a specific custom model
 */
router.get('/:id', protect, async (req, res) => {
  try {
    const modelId = req.params.id.startsWith('custom/') ? req.params.id : `custom/${req.params.id}`;
    const model = await CustomModelService.getCustomModel(modelId);
    
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'Custom model not found'
      });
    }

    res.json({
      success: true,
      data: model
    });
  } catch (error) {
    console.error('Error fetching custom model:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/custom-models
 * Create a new custom model
 */
router.post('/', protect, async (req, res) => {
  try {
    const modelData = req.body;
    const newModel = await CustomModelService.createCustomModel(modelData, req.user.id);
    
    res.status(201).json({
      success: true,
      data: newModel,
      message: 'Custom model created successfully'
    });
  } catch (error) {
    console.error('Error creating custom model:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/v1/custom-models/:id
 * Update a custom model
 */
router.put('/:id', protect, async (req, res) => {
  try {
    const modelId = req.params.id.startsWith('custom/') ? req.params.id : `custom/${req.params.id}`;
    const updates = req.body;
    
    const updatedModel = await CustomModelService.updateCustomModel(modelId, updates, req.user.id);
    
    res.json({
      success: true,
      data: updatedModel,
      message: 'Custom model updated successfully'
    });
  } catch (error) {
    console.error('Error updating custom model:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/v1/custom-models/:id
 * Delete (deactivate) a custom model
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    const modelId = req.params.id.startsWith('custom/') ? req.params.id : `custom/${req.params.id}`;
    
    await CustomModelService.deleteCustomModel(modelId, req.user.id);
    
    res.json({
      success: true,
      message: 'Custom model deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting custom model:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

export default router;