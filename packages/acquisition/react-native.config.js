module.exports = {
  dependency: {
    platforms: {
      ios: null,
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.healthcvapp.acquisition.bridge.NitroAcquisitionPackage;',
        packageInstance: 'new NitroAcquisitionPackage()',
      },
    },
  },
};
