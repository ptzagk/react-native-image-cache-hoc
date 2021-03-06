/**
 *
 * This HOC adds the following functionality to react native <Image> components:
 *
 * - File caching. Images will be downloaded to a cache on the local file system.
 *   Cache is maintained until cache size meets a certain threshold at which point the oldest
 *   cached files are purged to make room for fresh files.
 *
 *  - File persistence. Images will be stored indefinitely on local file system.
 *    Required for images that are related to issues that have been downloaded for offline use.
 *
 * More info: https://facebook.github.io/react/docs/higher-order-components.html
 *
 */

// Load dependencies.
import React from 'react';
import { View } from 'react-native';
import PropTypes from 'prop-types';
import FileSystemFactory, { FileSystem } from '../lib/FileSystem';
import traverse from 'traverse';
import validator from 'validator';
import uuid from 'react-native-uuid';

export default function imageCacheHoc(Image, options = {}) {

  return class extends React.Component {

    static propTypes = {
      fileHostWhitelist: PropTypes.array,
      source: PropTypes.object.isRequired,
      permanent: PropTypes.bool,
      style: View.propTypes.style
    };

    constructor(props) {
      super(props);

      // Set initial state
      this.state = {
        localFilePath: null
      };

      // Assign component unique ID for cache locking.
      this.componentId = uuid.v4();

      // Set default options
      this.options = {
        validProtocols: options.validProtocols || ['https'],
        fileHostWhitelist: options.fileHostWhitelist || [],
        cachePruneTriggerLimit: options.cachePruneTriggerLimit || 1024 * 1024 * 15, // Maximum size of image file cache in bytes before pruning occurs. Defaults to 15 MB.
        fileDirName: options.fileDirName || null // Namespace local file writing to this directory. Defaults to 'react-native-image-cache-hoc'.
      };

      // Init file system lib
      this.fileSystem = FileSystemFactory(this.options.cachePruneTriggerLimit, this.options.fileDirName);

      // Validate input
      this._validateImageComponent();

    }

    _validateImageComponent() {

      // Define validator options
      let validatorUrlOptions = { protocols: this.options.validProtocols, require_protocol: true };
      if (this.options.fileHostWhitelist.length) {
        validatorUrlOptions.host_whitelist = this.options.fileHostWhitelist;
      }

      // Validate source prop to be a valid web accessible url.
      if (
        !traverse(this.props).get(['source', 'uri'])
        || !validator.isURL(traverse(this.props).get(['source', 'uri']), validatorUrlOptions)
      ) {
        throw new Error('Invalid source prop. <CacheableImage> props.source.uri should be a web accessible url with a valid protocol and host. NOTE: Default valid protocol is https, default valid hosts are *.');
      } else {
        return true;
      }

    }

    // Async calls to local FS or network should occur here.
    // See: https://reactjs.org/docs/react-component.html#componentdidmount
    componentDidMount() {

      // Add a cache lock to file with this name (prevents concurrent <CacheableImage> components from pruning a file with this name from cache).
      let fileName = this.fileSystem.getFileNameFromUrl(traverse(this.props).get(['source', 'uri']));
      FileSystem.lockCacheFile(fileName, this.componentId);

      // Check local fs for file, fallback to network and write file to disk if local file not found.
      let permanent = this.props.permanent ? true : false;

      this.fileSystem.getLocalFilePathFromUrl(traverse(this.props).get(['source', 'uri']), permanent)
        .then( localFilePath => {
          this.setState({ localFilePath });
        });

    }

    componentWillUnmount() {

      // Remove component cache lock on associated image file on component teardown.
      let fileName = this.fileSystem.getFileNameFromUrl(traverse(this.props).get(['source', 'uri']));
      FileSystem.unlockCacheFile(fileName, this.componentId);

    }

    render() {

      // If media loaded, render full image component, else render placeholder.
      if (this.state.localFilePath) {

        // Extract props proprietary to this HOC before passing props through.
        let { permanent, ...filteredProps } = this.props; // eslint-disable-line no-unused-vars

        let props = Object.assign({}, filteredProps, { uri: this.state.localFilePath });
        return (<Image {...props} />);
      } else {
        return (<Image style={this.props.style ? this.props.style : undefined} />);
      }

    }

  };

}