const express = require('express');
const router = express.Router();
const archiver = require('archiver');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { auth, optionalAuth } = require('../middleware/auth');
const { specGenerateLimiter } = require('../middleware/rateLimit');
const { generateFreeSpec, generateProSpec } = require('../utils/aiGenerator');

// Generate spec (free or pro)
router.post('/generate', specGenerateLimiter, optionalAuth, async (req, res) => {
  try {
    const {
      appName, appDescription, problemSolved, targetUsers,
      platform, aiTool, features, userRoles, authType,
      techStack, database, designStyle, colorScheme,
      referenceUrl, needsPayments, needsUploads, needsRealtime,
      darkMode, specType, paymentId
    } = req.body;

    // Validate required fields
    if (!appDescription || appDescription.trim().length < 20) {
      return res.status(400).json({ error: 'Please describe your app idea (at least 20 characters)' });
    }

    const isPro = specType === 'pro';

    // Pro requires payment verification
    if (isPro) {
      if (!paymentId) {
        return res.status(400).json({ error: 'Payment required for Pro spec' });
      }
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      if (!payment || payment.status !== 'completed') {
        return res.status(400).json({ error: 'Valid payment not found' });
      }
    }

    // Build input object
    const input = {
      appName: appName || 'My App',
      appDescription,
      problemSolved,
      targetUsers,
      platform: platform || 'web',
      aiTool: aiTool || 'claude-code',
      features: features || [],
      userRoles: userRoles || ['user'],
      authType,
      techStack: techStack || 'auto',
      database: database || 'auto',
      designStyle,
      colorScheme,
      referenceUrl,
      needsPayments: !!needsPayments,
      needsUploads: !!needsUploads,
      needsRealtime: !!needsRealtime,
      darkMode: !!darkMode
    };

    console.log(`Generating ${isPro ? 'PRO' : 'FREE'} spec for: ${input.appName}`);

    // Generate spec
    let basicSpec = null;
    let fullSpecPack = null;

    if (isPro) {
      fullSpecPack = await generateProSpec(input);
      // Also generate a combined single file for preview
      basicSpec = Object.entries(fullSpecPack)
        .map(([name, content]) => `<!-- ${name} -->\n${content}`)
        .join('\n\n---\n\n');
    } else {
      basicSpec = await generateFreeSpec(input);
    }

    // Save to database if user is logged in
    let specId = null;
    if (req.user) {
      const spec = await prisma.spec.create({
        data: {
          userId: req.user.id,
          appName: input.appName,
          appDescription: input.appDescription,
          problemSolved: input.problemSolved,
          targetUsers: input.targetUsers,
          platform: input.platform,
          aiTool: input.aiTool,
          features: input.features,
          userRoles: input.userRoles,
          authType: input.authType,
          techStack: input.techStack,
          database: input.database,
          designStyle: input.designStyle,
          colorScheme: input.colorScheme,
          referenceUrl: input.referenceUrl,
          needsPayments: input.needsPayments,
          needsUploads: input.needsUploads,
          needsRealtime: input.needsRealtime,
          darkMode: input.darkMode,
          basicSpec,
          fullSpecPack,
          specType: isPro ? 'pro' : 'free',
          status: 'completed',
          generationsUsed: 1,
          maxGenerations: isPro ? 3 : 1,
          paymentId: isPro ? paymentId : null
        }
      });
      specId = spec.id;
    }

    console.log(`Spec generated successfully: ${specId || 'anonymous'}`);

    res.json({
      specId,
      specType: isPro ? 'pro' : 'free',
      basicSpec,
      fullSpecPack: isPro ? fullSpecPack : null,
      message: 'Spec generated successfully'
    });
  } catch (error) {
    console.error('Spec generation error:', error);
    res.status(500).json({ error: 'Failed to generate spec', details: error.message });
  }
});

// Get spec by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const spec = await prisma.spec.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!spec) {
      return res.status(404).json({ error: 'Spec not found' });
    }
    res.json({ spec });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch spec' });
  }
});

// Download single .md
router.get('/:id/download', optionalAuth, async (req, res) => {
  try {
    let spec;
    if (req.user) {
      spec = await prisma.spec.findFirst({
        where: { id: req.params.id, userId: req.user.id }
      });
    } else {
      spec = await prisma.spec.findUnique({ where: { id: req.params.id } });
    }

    if (!spec || !spec.basicSpec) {
      return res.status(404).json({ error: 'Spec not found' });
    }

    const filename = `${(spec.appName || 'spec').toLowerCase().replace(/[^a-z0-9]/g, '-')}-spec.md`;
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(spec.basicSpec);
  } catch (error) {
    res.status(500).json({ error: 'Download failed' });
  }
});

// Download pro pack as .zip
router.get('/:id/download-pack', auth, async (req, res) => {
  try {
    const spec = await prisma.spec.findFirst({
      where: { id: req.params.id, userId: req.user.id, specType: 'pro' }
    });

    if (!spec || !spec.fullSpecPack) {
      return res.status(404).json({ error: 'Pro spec pack not found' });
    }

    const appSlug = (spec.appName || 'spec').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const zipFilename = `${appSlug}-spec-pack.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    const pack = spec.fullSpecPack;
    for (const [filename, content] of Object.entries(pack)) {
      archive.append(content, { name: `${appSlug}/${filename}` });
    }

    await archive.finalize();
  } catch (error) {
    console.error('Download pack error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// List user's specs
router.get('/', auth, async (req, res) => {
  try {
    const specs = await prisma.spec.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, appName: true, specType: true, platform: true,
        aiTool: true, status: true, createdAt: true
      }
    });
    res.json({ specs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch specs' });
  }
});

module.exports = router;
