import React, { useMemo, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTable, useGlobalFilter, useSortBy, useAsyncDebounce } from 'react-table';
import { useSelector, useDispatch } from 'react-redux';


// TODO: move this file closer to HostsDataTable
import { humanHostMemory, humanHostUptime } from 'kolide/helpers';
import { setPagination, getHostTableData } from 'redux/nodes/components/ManageHostsPage/actions';
import scrollToTop from 'utilities/scroll_to_top';
import Spinner from 'components/loaders/Spinner';
import HostPagination from 'components/hosts/HostPagination';

import HeaderCell from '../HeaderCell/HeaderCell';
import TextCell from '../TextCell/TextCell';
import StatusCell from '../StatusCell/StatusCell';
import LinkCell from '../LinkCell/LinkCell';

// TODO: pass in as props
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_PAGE_INDEX = 0;
const DEBOUNCE_QUERY_DELAY = 300;
const DEFAULT_SORT_KEY = 'hostname';
const DEFAULT_SORT_DIRECTION = 'ASC';

// TODO: possibly get rid of this.
const containerClass = 'host-container';

// TODO: pull out to another file
// How we are handling lables and host counts on the client is strange. This function is required
// to try to hide some of that complexity, but ideally we'd come back and simplify how we are
// working with labels on the client.
const calculateTotalHostCount = (selectedFilter, labels, statusLabels) => {
  if (Object.keys(labels).length === 0) return 0;

  let hostCount = 0;
  switch (selectedFilter) {
    case 'all-hosts':
      hostCount = statusLabels.total_count;
      break;
    case 'new':
      hostCount = statusLabels.new_count;
      break;
    case 'online':
      hostCount = statusLabels.online_count;
      break;
    case 'offline':
      hostCount = statusLabels.offline_count;
      break;
    case 'mia':
      hostCount = statusLabels.mia_count;
      break;
    default: {
      const labelId = selectedFilter.split('/')[1];
      hostCount = labels[labelId].count;
      break;
    }
  }
  return hostCount;
};

// This data table uses react-table for implementation. The relevant documentation of the library
// can be found here https://react-table.tanstack.com/docs/api/useTable
const HostsDataTable = (props) => {
  const {
    // selectedFilter is passed from parent, as it ultimately comes from the router and this
    // component cannot access the router state.
    selectedFilter,
    searchQuery,
  } = props;

  const dispatch = useDispatch();
  const loadingHosts = useSelector(state => state.entities.hosts.loading);
  const hosts = useSelector(state => state.entities.hosts.data);
  const page = useSelector(state => state.components.ManageHostsPage.page);
  const perPage = useSelector(state => state.components.ManageHostsPage.perPage);
  const totalHostCount = useSelector((state) => {
    return calculateTotalHostCount(
      selectedFilter,
      state.entities.labels.data,
      state.components.ManageHostsPage.status_labels,
    );
  });

  // This variable is used to keep the react-table state persistant across server calls for new data.
  // You can read more about this here technique here:
  // https://react-table.tanstack.com/docs/faq#how-do-i-stop-my-table-state-from-automatically-resetting-when-my-data-changes
  const skipPageResetRef = useRef();

  // TODO: maybe pass as props?
  const columns = useMemo(() => {
    return [
      { Header: cellProps => <HeaderCell all={cellProps.column} value={'Hostname'} isSortedDesc={cellProps.column.isSortedDesc} />, accessor: 'hostname', Cell: cellProps => <LinkCell value={cellProps.cell.value} host={cellProps.row.original} /> },
      { Header: 'Status', disableSortBy: true, accessor: 'status', Cell: cellProps => <StatusCell value={cellProps.cell.value} /> },
      { Header: cellProps => <HeaderCell all={cellProps.column} value={'OS'} isSortedDesc={cellProps.column.isSortedDesc} />, accessor: 'os_version', Cell: cellProps => <TextCell value={cellProps.cell.value} /> },
      { Header: cellProps => <HeaderCell value={'Osquery'} isSortedDesc={cellProps.column.isSortedDesc} />, accessor: 'osquery_version', Cell: cellProps => <TextCell value={cellProps.cell.value} /> },
      { Header: cellProps => <HeaderCell value={'IPv4'} isSortedDesc={cellProps.column.isSortedDesc} />, accessor: 'primary_ip', Cell: cellProps => <TextCell value={cellProps.cell.value} /> },
      { Header: cellProps => <HeaderCell value={'Physical Address'} isSortedDesc={cellProps.column.isSortedDesc} />, accessor: 'primary_mac', Cell: cellProps => <TextCell value={cellProps.cell.value} /> },
      { Header: 'CPU', disableSortBy: true, accessor: 'host_cpu', Cell: cellProps => <TextCell value={cellProps.cell.value} /> },
      { Header: cellProps => <HeaderCell value={'Memory'} isSortedDesc={cellProps.column.isSortedDesc} />, accessor: 'memory', Cell: cellProps => <TextCell value={cellProps.cell.value} formatter={humanHostMemory} /> },
      { Header: cellProps => <HeaderCell value={'Uptime'} isSortedDesc={cellProps.column.isSortedDesc} />, accessor: 'uptime', Cell: cellProps => <TextCell value={cellProps.cell.value} formatter={humanHostUptime} /> },
    ];
  }, []);

  const data = useMemo(() => {
    return Object.values(hosts);
  }, [hosts]);

  const {
    headerGroups,
    rows,
    prepareRow,
    setGlobalFilter,
    state: tableState,
  } = useTable(
    { columns,
      data,
      initialState: {
        sortBy: [{ id: DEFAULT_SORT_KEY, desc: DEFAULT_SORT_DIRECTION === 'DESC' }],
        pageSize: DEFAULT_PAGE_SIZE,
        pageIndex: DEFAULT_PAGE_INDEX,
      },
      disableMultiSort: true,
      autoResetSortBy: skipPageResetRef.current,
      autoResetGlobalFilter: skipPageResetRef.current,
    },
    useGlobalFilter,
    useSortBy,
  );
  const { globalFilter, sortBy } = tableState;

  const debouncedGlobalFilter = useAsyncDebounce((value) => {
    skipPageResetRef.current = true;
    setGlobalFilter(value || undefined);
  }, DEBOUNCE_QUERY_DELAY);

  const onPaginationChange = useCallback((nextPage) => {
    skipPageResetRef.current = true;
    dispatch(setPagination(nextPage, perPage, selectedFilter));
    scrollToTop();
  }, [dispatch, perPage, selectedFilter]);

  // Since searchQuery is feed in from the parent, we want to debounce the globalfilter change
  // when we see it change.
  useEffect(() => {
    debouncedGlobalFilter(searchQuery);
  }, [debouncedGlobalFilter, searchQuery]);

  // Any changes to these relevent table search params will fire off an action to get the new
  // hosts data.
  useEffect(() => {
    // console.log('fetching data', tableState);
    dispatch(getHostTableData(page, perPage, selectedFilter, globalFilter, sortBy));
    skipPageResetRef.current = false;
  }, [dispatch, page, perPage, selectedFilter, globalFilter, sortBy]);

  // No hosts for this result.
  if (!loadingHosts && Object.values(hosts).length === 0) {
    return (
      <div className={`${containerClass}  ${containerClass}--no-hosts`}>
        <div className={`${containerClass}--no-hosts__inner`}>
          <div>
            <h1>No hosts match the current search criteria</h1>
            <p>Expecting to see new hosts? Try again in a few seconds as the system catches up</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <React.Fragment>
      <div className={'hosts-table hosts-table__wrapper'}>
        <table className={'hosts-table__table'}>
          <thead>
            {headerGroups.map(headerGroup => (
              <tr {...headerGroup.getHeaderGroupProps()}>
                {headerGroup.headers.map(column => (
                  <th {...column.getHeaderProps(column.getSortByToggleProps())}>
                    {column.render('Header')}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loadingHosts
              ? <tr><td><Spinner /></td></tr>
              : rows.map((row) => {
                prepareRow(row);
                return (
                  <tr {...row.getRowProps()}>
                    {row.cells.map((cell) => {
                      return (
                        <td {...cell.getCellProps()}>
                          {cell.render('Cell')}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            }
          </tbody>
        </table>
      </div>

      <HostPagination
        allHostCount={totalHostCount}
        currentPage={page}
        hostsPerPage={perPage}
        onPaginationChange={onPaginationChange}
      />
    </React.Fragment>
  );
};

HostsDataTable.propTypes = {
  selectedFilter: PropTypes.string,
  searchQuery: PropTypes.string,
};

export default HostsDataTable;
