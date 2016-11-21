import { isEmpty } from 'lodash';

const formChanged = (formData, query) => {
  return formData.name !== query.name ||
    formData.description !== query.description ||
    formData.query !== query.query;
};

const canSaveAsNew = (formData, query) => {
  if (isEmpty(query)) {
    return true;
  }

  if (formData.name !== query.name) {
    return true;
  }

  return false;
};

const canSaveChanges = (formData, query) => {
  if (isEmpty(query)) {
    return false;
  }

  if (formChanged(formData, query)) {
    return true;
  }

  return false;
};

const allPlatforms = { label: 'All Platforms', value: '' };
const platformOptions = [
  allPlatforms,
  { label: 'mac OS', value: 'darwin' },
  { label: 'Windows', value: 'windows' },
  { label: 'Ubuntu', value: 'ubuntu' },
  { label: 'Centos', value: 'centos' },
];

export default { allPlatforms, canSaveAsNew, canSaveChanges, platformOptions };